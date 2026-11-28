import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { Deck, DeckCard, DeckChoicePage, DeckSnapshot } from '@spellbook/contracts/decks.ts';
import {
	deckLibraryQueryKey,
	type DeckLibraryItem,
	type DeckLibraryPage,
	type DeckLibraryQuery
} from '@spellbook/contracts/deck-library.ts';
import { readDemo, updateDemo } from './storage.ts';
import { DemoDraftConflict } from './conflict.ts';
import { ValidationError } from '@spellbook/contracts/validation.ts';

export type DemoDeck = {
	version?: string;
	deck: Deck;
	cards: DeckCard[];
	documents: Record<string, CardDocument>;
	tokens: DeckSnapshot['relatedTokens'];
};
export type DemoDecks = Record<string, DemoDeck | null>;

async function demoDeckItems(session: string) {
	const changes = (await readDemo<DemoDecks>(session, 'decks')) ?? {};
	const limit = 200;
	const items: DeckLibraryItem[] = [];
	let revision: string | undefined;
	for (let offset = 0; ; offset += limit) {
		const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
		if (revision !== undefined) params.set('revision', revision);
		const response = await fetch('/api/v1/mtg/deck-library?' + params);
		if (!response.ok) throw new Error('Deck Library seed unavailable');
		const page: DeckLibraryPage = await response.json();
		revision = page.revision;
		items.push(...page.items.filter(({ id }) => !(id in changes)));
		if (offset + page.items.length >= page.matchingTotal || page.items.length === 0) break;
	}
	for (const change of Object.values(changes)) {
		if (!change) continue;
		const { deck, cards } = change;
		items.push({
			...deck,
			quantity: cards.reduce((total, card) => total + card.quantity, 0),
			imageUri: cards[0]?.imageUri ?? ''
		});
	}
	return {
		items,
		revision: JSON.stringify([
			revision,
			Object.entries(changes).map(([id, value]) => [id, value?.version ?? null])
		])
	};
}

export async function demoDeckLibrary(
	session: string,
	query: DeckLibraryQuery,
	offset: number,
	limit: number
): Promise<DeckLibraryPage> {
	const { items, revision } = await demoDeckItems(session);
	const matching = items.filter((deck) => {
		if (query.format && deck.format.toLowerCase() !== query.format.toLowerCase()) return false;
		if (!deck.name.toLowerCase().includes(query.query.toLowerCase())) return false;
		return true;
	});
	matching.sort((a, b) => {
		if (query.sort === 'name:asc') return a.name.localeCompare(b.name);
		if (query.sort === 'name:desc') return b.name.localeCompare(a.name);
		return b.updatedAt.localeCompare(a.updatedAt);
	});
	return {
		query,
		queryKey: deckLibraryQueryKey(query),
		revision,
		offset,
		limit,
		matchingTotal: matching.length,
		globalTotal: items.length,
		items: matching
			.slice(offset, offset + limit)
			.map((deck) => ({ ...deck, availability: undefined }))
	};
}

export async function demoDeckChoices(
	session: string,
	query: string,
	offset: number,
	selectedId: string
): Promise<DeckChoicePage> {
	const { items } = await demoDeckItems(session);
	const choices = items.map(({ id, name, format }) => ({ id, name, format }));
	const matching = choices
		.filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()))
		.sort((a, b) => a.name.localeCompare(b.name));
	return {
		items: matching.slice(offset, offset + 20),
		nextOffset: offset + 20 < matching.length ? offset + 20 : null,
		selected: choices.find(({ id }) => id === selectedId) ?? null
	};
}

export function changeDemoDeck(
	operation: string,
	form: FormData,
	accountId: string,
	deckId: string,
	current: DemoDeck | undefined,
	printing?: CardDocument
): DemoDeck | null {
	const field = (key: string) => String(form.get(key) ?? '').trim();
	const now = new Date().toISOString();
	if (operation === 'createDeck' || operation === 'updateDeck') {
		if (
			!field('name') ||
			field('name').length > 200 ||
			field('format').length > 100 ||
			field('description').length > 4000
		)
			throw new ValidationError('Invalid Deck details');
	}
	if (operation === 'deleteDeck') return null;
	if (operation === 'createDeck') {
		return {
			deck: {
				id: deckId,
				accountId,
				game: 'mtg',
				name: field('name'),
				format: field('format') || 'Commander',
				description: field('description'),
				assembled: ['true', 'on'].includes(field('assembled')),
				autoRefreshTokens: true,
				descriptionRevision: '0',
				compositionRevision: '0',
				createdAt: now,
				updatedAt: now
			},
			cards: [],
			documents: {},
			tokens: { status: 'available', items: [], unresolved: [], unavailableEntryIds: [] }
		};
	}
	if (!current) throw new ValidationError('Deck not found');
	const result = structuredClone(current);
	const { deck, cards, documents, tokens } = result;
	deck.updatedAt = now;
	switch (operation) {
		case 'updateDeck': {
			for (const key of ['name', 'format'] as const) {
				if (!form.has(key + 'Base') || field(key) !== field(key + 'Base')) deck[key] = field(key);
			}
			if (
				!form.has('descriptionBase') ||
				field('description') !== field('descriptionBase') ||
				form.has('rebaseDescription')
			) {
				if (
					field(form.has('rebaseDescription') ? 'rebaseDescription' : 'descriptionRevision') !==
					deck.descriptionRevision
				)
					throw new DemoDraftConflict();
				deck.description = field('description');
				deck.descriptionRevision = crypto.randomUUID();
			}
			break;
		}
		case 'toggleAssembled':
			deck.assembled = field('assembled') === 'true';
			break;
		case 'tokenSettings': {
			const op = field('op');
			if (op === 'auto') deck.autoRefreshTokens = field('enabled') === 'true';
			else {
				const token = tokens.items.find((item) => item.catalogCardId === field('catalogCardId'));
				if (op === 'refresh') break;
				if (!token) throw new ValidationError('Token not found');
				if (op === 'include') token.includeWhenOrphaned = field('included') === 'true';
				if (op === 'reset') token.userDelta = 0;
				if (op === 'remove' && !token.suggestedQuantity) {
					tokens.items = tokens.items.filter((item) => item !== token);
					break;
				}
				if (op === 'quantity') {
					const quantity = Number(field('quantity'));
					if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647)
						throw new ValidationError('Invalid quantity');
					token.userDelta = quantity - token.suggestedQuantity;
				}
				token.effectiveQuantity = Math.max(0, token.suggestedQuantity + token.userDelta);
			}
			break;
		}
		case 'addCard':
		case 'updateCard':
		case 'changePrinting':
		case 'removeCard': {
			const entryId = field('entryId');
			const entry = cards.find(({ id }) => id === entryId);
			if (operation !== 'addCard' && !entry) throw new ValidationError('Card not found');
			if (entry) cards.splice(cards.indexOf(entry), 1);
			if (operation === 'removeCard') break;
			const role = field('role') || entry?.role || 'main';
			const quantity = form.has('delta')
				? (entry?.quantity ?? 0) + Number(field('delta'))
				: Number(form.get('quantity') ?? 1);
			if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 2_147_483_647)
				throw new ValidationError('Invalid quantity');
			const catalogCardId = printing?.id ?? entry?.catalogCardId;
			if (!catalogCardId) throw new ValidationError('Printing not found');
			const existing = cards.find(
				(card) => card.catalogCardId === catalogCardId && card.role === role
			);
			if (printing) documents[catalogCardId] = printing;
			if (existing) {
				if (existing.quantity + quantity > 2_147_483_647)
					throw new ValidationError('Invalid quantity');
				existing.quantity += quantity;
			} else if (quantity) {
				cards.push({
					id: entry?.id ?? crypto.randomUUID(),
					deckId,
					accountId,
					game: 'mtg',
					catalogCardId,
					canonicalCardId: printing?.oracle_id ?? entry!.canonicalCardId,
					name: printing?.name ?? entry!.name,
					setCode: printing?.set_code ?? entry!.setCode,
					imageUri: printing?.image_uri ?? entry!.imageUri,
					quantity,
					role,
					createdAt: entry?.createdAt ?? now,
					updatedAt: now
				});
			}
			deck.compositionRevision = crypto.randomUUID();
			break;
		}
		default:
			throw new ValidationError('Unsupported Demo action');
	}
	return result;
}

function mergeTokenPreview(previous: DemoDeck['tokens'], preview: DemoDeck['tokens']) {
	const old = new Map(previous.items.map((item) => [item.catalogCardId, item]));
	const items = preview.items.map((item) => {
		const prior = old.get(item.catalogCardId);
		old.delete(item.catalogCardId);
		const userDelta = prior?.userDelta ?? 0;
		return {
			...item,
			userDelta,
			effectiveQuantity: Math.max(0, item.suggestedQuantity + userDelta)
		};
	});
	const unavailable = new Set(preview.unavailableEntryIds);
	for (const item of old.values()) {
		if (
			item.sourceEntryIds.some((id) => unavailable.has(id)) ||
			preview.unresolved.some(({ catalogCardId }) => catalogCardId === item.catalogCardId)
		) {
			items.push(item);
		} else {
			const userDelta = Math.max(0, item.userDelta);
			items.push({
				...item,
				sourceEntryIds: [],
				suggestedQuantity: 0,
				userDelta,
				effectiveQuantity: userDelta
			});
		}
	}
	return { ...preview, items: items.sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function mutateDemoDeck(input: {
	session: string;
	generation: string | undefined;
	operation: string;
	form: FormData;
	accountId: string;
	deckId: string;
	seed?: DemoDeck;
	printing?: CardDocument;
}) {
	const { session, generation, operation, form, accountId, deckId, seed } = input;
	let printing = input.printing;
	if (!printing && (operation === 'addCard' || operation === 'changePrinting')) {
		const id = String(form.get('catalogCardId') ?? '');
		const response = await fetch(`/api/v1/mtg/catalog/printings/${encodeURIComponent(id)}`);
		if (!response.ok) throw new Error('Printing unavailable');
		printing = await response.json();
	}

	const local = (await readDemo<DemoDecks>(session, 'decks')) ?? {};
	let initial = deckId in local ? (local[deckId] ?? undefined) : seed;
	if (!initial && !(deckId in local) && operation === 'addCard') {
		const response = await fetch(
			`/api/v1/mtg/decks/${encodeURIComponent(deckId)}?selectedOnly=true&includeLegality=false`
		);
		if (!response.ok) throw new Error('Deck unavailable');
		const snapshot: DeckSnapshot = await response.json();
		const deck = snapshot.decks.find(({ id }) => id === deckId);
		if (deck)
			initial = {
				deck,
				cards: snapshot.deckCards,
				documents: {},
				tokens: snapshot.relatedTokens
			};
	}
	const updated = changeDemoDeck(operation, form, accountId, deckId, initial, printing);
	if (
		updated &&
		((updated.deck.autoRefreshTokens &&
			['addCard', 'changePrinting', 'updateCard', 'removeCard'].includes(operation)) ||
			(operation === 'tokenSettings' &&
				(form.get('op') === 'refresh' ||
					(form.get('op') === 'auto' && updated.deck.autoRefreshTokens))))
	) {
		const cards = updated.cards.map(({ id, catalogCardId, quantity, role }) => ({
			id,
			catalogCardId,
			quantity,
			role
		}));
		const response = await fetch('/api/v1/mtg/decks/token-preview', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cards })
		});
		if (!response.ok) throw new Error('Deck Token preview unavailable');
		updated.tokens = mergeTokenPreview(updated.tokens, await response.json());
	}
	if (updated) updated.version = crypto.randomUUID();
	await updateDemo<DemoDecks>(
		session,
		'decks',
		{},
		(changes) => {
			if (
				deckId in changes !== deckId in local ||
				changes[deckId]?.version !== local[deckId]?.version
			) {
				throw new ValidationError('Deck changed in another tab');
			}
			return { ...changes, [deckId]: updated };
		},
		{ generation }
	);
}
