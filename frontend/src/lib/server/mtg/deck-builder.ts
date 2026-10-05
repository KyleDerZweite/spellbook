import type { CardDocument } from '#lib/search/types.ts';
import type { DeckCard } from '#lib/server/data/types.ts';
import { bulkMutateDeckCards, getDeckSnapshot } from '#lib/server/data/decks.ts';
import { getCatalogPrinting, searchCatalog } from '#lib/server/catalog/search.ts';
import { formatArenaDecklist } from './decklist';
import { generateLegalityWarnings } from './legality';
import { isCommittedDeckRole, previewMtgImport, toCardIdentity } from './import';
import { assertDeckRole, ValidationError } from './validation';

export const searchDeckCatalog = searchCatalog;

export async function addCatalogCardToDeck(
	accountId: string,
	input: {
		deckId: string;
		catalogCardId: string;
		quantity: number;
		role: string;
		requestId: string;
	}
) {
	const card = await getCatalogPrinting(input.catalogCardId);
	return bulkMutateDeckCards(accountId, {
		deckId: input.deckId,
		requestId: input.requestId,
		game: 'mtg',
		source: 'web',
		operations: [
			{
				op: 'add',
				card: toCardIdentity(card),
				quantity: input.quantity,
				role: assertDeckRole(input.role)
			}
		]
	});
}

export async function importIntoDeck(
	accountId: string,
	input: {
		deckId: string;
		text: string;
		requestId: string;
	}
) {
	const snapshot = await getDeckSnapshot(accountId);
	const deck = snapshot.decks.find((deck) => deck.id === input.deckId);
	if (!deck) throw new ValidationError('Deck not found');
	const preview = await previewMtgImport(input.text, deck.format);
	const operations = preview.resolved.flatMap(({ line, card }) =>
		isCommittedDeckRole(line.role)
			? [
					{
						op: 'add' as const,
						card: toCardIdentity(card),
						quantity: line.quantity,
						role: line.role
					}
				]
			: []
	);
	if (!operations.length) throw new ValidationError('No resolved deck lines to commit');
	await bulkMutateDeckCards(accountId, {
		deckId: deck.id,
		requestId: input.requestId,
		game: deck.game,
		source: 'import',
		operations
	});
	return preview;
}

async function resolveDeckCards(cards: DeckCard[]): Promise<Map<string, CardDocument>> {
	const result = new Map<string, CardDocument>();
	const ids = [...new Set(cards.map((card) => card.catalogCardId))];
	for (let offset = 0; offset < ids.length; offset += 8) {
		const batch = await Promise.all(ids.slice(offset, offset + 8).map(getCatalogPrinting));
		for (const card of batch) result.set(card.id, card);
	}
	return result;
}

export async function getDeckLegality(
	cards: DeckCard[],
	format: string,
	resolved?: Map<string, CardDocument>
) {
	const catalogCards = await resolveDeckCards(cards);
	for (const [id, card] of catalogCards) resolved?.set(id, card);
	return generateLegalityWarnings(
		cards.map((row) => ({
			quantity: row.quantity,
			role: assertDeckRole(row.role),
			card: catalogCards.get(row.catalogCardId)!
		})),
		format
	);
}

export async function exportDecklist(cards: DeckCard[]): Promise<string> {
	try {
		const catalogCards = await resolveDeckCards(cards);
		return formatArenaDecklist(
			cards.map((card) => ({
				...card,
				collectorNumber: catalogCards.get(card.catalogCardId)!.collector_number
			}))
		);
	} catch {
		return formatArenaDecklist(cards);
	}
}

export async function changeDeckPrinting(
	accountId: string,
	input: {
		entryId: string;
		catalogCardId: string;
		quantity: number;
		role: string;
		requestId: string;
	}
) {
	const snapshot = await getDeckSnapshot(accountId);
	const entry = snapshot.deckCards.find((card) => card.id === input.entryId);
	if (!entry) throw new ValidationError('Deck entry not found');
	const printing = await getCatalogPrinting(input.catalogCardId);
	if (printing.oracle_id !== entry.canonicalCardId)
		throw new ValidationError('Choose a printing of the same card');
	return bulkMutateDeckCards(accountId, {
		deckId: entry.deckId,
		requestId: input.requestId,
		game: 'mtg',
		source: 'web',
		operations: [
			{ op: 'remove', target: { entryId: entry.id } },
			{
				op: 'add',
				card: toCardIdentity(printing),
				quantity: input.quantity,
				role: assertDeckRole(input.role)
			}
		]
	});
}
