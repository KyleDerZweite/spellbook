import { error, fail, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import type { Action, Actions, PageServerLoad } from './$types';
import {
	createDeckRecord,
	deleteDeck,
	getDeckSnapshot,
	removeDeckCard,
	updateDeck,
	updateDeckCard
} from '#lib/server/data/decks.ts';
import {
	addCatalogCardToDeck,
	changeDeckPrinting,
	getDeckLegality,
	importIntoDeck
} from '#lib/server/mtg/deck-builder.ts';
import { application } from '#lib/server/composition.ts';
import { getPrintings } from '#lib/server/catalog/search.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { DescriptionConflictError, DeckNotFoundError } from '#lib/server/data/decks.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import type { CardDocument } from '#lib/search/types.ts';
import type { LegalityWarning } from '#lib/server/mtg/legality.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
	const selectedDeckId = url.searchParams.get('deck') ?? null;
	let snapshot;
	try {
		snapshot = await getDeckSnapshot(locals.user, 'mtg', selectedDeckId);
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		throw cause;
	}
	const selectedDeck = snapshot.decks.find((deck) => deck.id === selectedDeckId);
	if (selectedDeckId && !selectedDeck) throw error(404, 'Deck not found');
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const oracleId = url.searchParams.get('printing') ?? '';
	let catalogCards: CardDocument[] = [];
	let catalogError = '';
	let warnings: LegalityWarning[] = [];
	let legalityError = '';
	const deckDocuments = new Map<string, CardDocument>();
	await Promise.all([
		(async () => {
			if (!query && !oracleId) return;
			try {
				if (oracleId && !/^[0-9a-f-]{36}$/i.test(oracleId)) {
					catalogError = 'Select a card to view its printings.';
					return;
				}
				const result = oracleId
					? await getPrintings(oracleId)
					: await application.decks.search(locals.user!, query);
				catalogCards = result.hits;
				if ('ownedByCanonical' in result) {
					Object.assign(snapshot.ownedByCanonical, result.ownedByCanonical);
				}
				if (oracleId && catalogCards.length) {
					const owned = await application.decks.ownership(locals.user!, [
						catalogCards[0].oracle_id
					]);
					snapshot.ownedPrintings.push(
						...owned.filter(
							(card) =>
								!snapshot.ownedPrintings.some(
									(existing) => existing.catalogCardId === card.catalogCardId
								)
						)
					);
					for (const card of owned)
						snapshot.ownedByCanonical[card.canonicalCardId] = owned
							.filter((entry) => entry.canonicalCardId === card.canonicalCardId)
							.reduce((sum, entry) => sum + entry.quantity, 0);
				}
			} catch {
				catalogError = 'The card catalog is unavailable. You can still edit your deck.';
			}
		})(),
		(async () => {
			if (!selectedDeck) return;
			try {
				const legality = await getDeckLegality(locals.user!, selectedDeck.id);
				warnings = legality.warnings;
				for (const [id, document] of Object.entries(legality.deckDocuments))
					deckDocuments.set(id, document);
			} catch {
				legalityError =
					'Card legality could not be checked. Try again when the catalog is available.';
			}
		})()
	]);
	return {
		...snapshot,
		flow: ['create', 'edit', 'import', 'delete', 'search'].includes(
			url.searchParams.get('flow') ?? ''
		)
			? url.searchParams.get('flow')!
			: '',
		requestId: crypto.randomUUID(),
		selectedDeckId,
		query,
		oracleId,
		catalogCards,
		catalogError,
		warnings,
		legalityError,
		deckDocuments: Object.fromEntries(deckDocuments)
	};
};

function guarded(action: Action): Action {
	return async (event) => {
		if (!event.locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
		try {
			return await action(event);
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
			if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
				throw redirect(303, '/auth/login?returnTo=/mtg/decks');
			if (cause instanceof DescriptionConflictError)
				return fail(409, { message: cause.message, conflict: cause.latest });
			if (cause instanceof RequestConflictError) return fail(409, { message: cause.message });
			if (cause instanceof DeckNotFoundError) return fail(404, { message: cause.message });
			if (cause instanceof ValidationError) return fail(400, { message: cause.message });
			console.error('Deck action failed', cause);
			return fail(503, { message: 'The deck could not be saved. Try again.' });
		}
	};
}

function field(form: FormData, name: string): string {
	return String(form.get(name) ?? '').trim();
}

export const actions = {
	createDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const createDraft = {
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			format: String(form.get('format') ?? '')
		};
		let deck;
		try {
			deck = await createDeckRecord(locals.user!, {
				game: 'mtg',
				name: field(form, 'name'),
				description: field(form, 'description'),
				format: field(form, 'format')
			});
		} catch (cause) {
			if (cause instanceof ValidationError)
				return fail(400, { message: cause.message, createDraft });
			throw cause;
		}
		throw redirect(303, `/mtg/decks?deck=${encodeURIComponent(deck.id)}`);
	}),
	updateDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const patch: import('@spellbook/contracts/decks.ts').DeckPatch = {
			deckId: field(form, 'deckId')
		};
		if (!form.has('nameBase') || field(form, 'name') !== field(form, 'nameBase'))
			patch.name = field(form, 'name');
		if (!form.has('formatBase') || field(form, 'format') !== field(form, 'formatBase'))
			patch.format = field(form, 'format');
		if (
			!form.has('descriptionBase') ||
			field(form, 'description') !== field(form, 'descriptionBase') ||
			form.has('rebaseDescription')
		) {
			patch.description = field(form, 'description');
			patch.descriptionRevision = field(
				form,
				form.has('rebaseDescription') ? 'rebaseDescription' : 'descriptionRevision'
			);
		}
		// Keep the submitted text and original bases for a native failed POST as well as enhancement.
		const detailsDraft = {
			deckId: patch.deckId,
			name: String(form.get('name') ?? ''),
			format: String(form.get('format') ?? ''),
			description: String(form.get('description') ?? ''),
			descriptionRevision: patch.descriptionRevision ?? field(form, 'descriptionRevision'),
			nameBase: form.has('nameBase') ? String(form.get('nameBase')) : undefined,
			formatBase: form.has('formatBase') ? String(form.get('formatBase')) : undefined,
			descriptionBase: form.has('descriptionBase') ? String(form.get('descriptionBase')) : undefined
		};
		try {
			const deck = await updateDeck(locals.user!, patch);
			if (!deck) return fail(404, { message: 'Deck not found.' });
			return { success: true, message: 'Deck details saved.', savedDetails: deck };
		} catch (cause) {
			if (cause instanceof DescriptionConflictError)
				return fail(409, { message: cause.message, conflict: cause.latest, detailsDraft });
			if (
				cause instanceof ValidationError &&
				!(cause instanceof DeckNotFoundError) &&
				!(cause instanceof RequestConflictError)
			)
				return fail(400, { message: cause.message, detailsDraft });
			throw cause;
		}
	}),
	deleteDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await deleteDeck(locals.user!, field(form, 'deckId'));
		throw redirect(303, '/mtg/decks');
	}),
	addCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await addCatalogCardToDeck(locals.user!, {
			deckId: field(form, 'deckId'),
			catalogCardId: field(form, 'catalogCardId'),
			quantity: Number(form.get('quantity') ?? 1),
			role: field(form, 'role'),
			requestId: field(form, 'requestId')
		});
		return { success: true, message: 'Card added to deck.' };
	}),
	changePrinting: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await changeDeckPrinting(locals.user!, {
			entryId: field(form, 'entryId'),
			catalogCardId: field(form, 'catalogCardId'),
			quantity: Number(form.get('quantity')),
			role: field(form, 'role'),
			requestId: field(form, 'requestId')
		});
		return { success: true, message: 'Card saved.' };
	}),
	updateCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await updateDeckCard(
			locals.user!,
			field(form, 'entryId'),
			Number(form.get('quantity')),
			field(form, 'role') || undefined,
			field(form, 'requestId'),
			form.has('delta') ? Number(form.get('delta')) : undefined
		);
		return { success: true, message: 'Card updated.' };
	}),
	removeCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await removeDeckCard(locals.user!, field(form, 'entryId'), field(form, 'requestId'));
		return { success: true, message: 'Card removed from deck.' };
	}),
	previewImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const snapshot = await getDeckSnapshot(locals.user!, 'mtg', field(form, 'deckId'));
		const deck = snapshot.decks.find((entry) => entry.id === field(form, 'deckId'));
		if (!deck) return fail(404, { message: 'Deck not found.' });
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, {
				message: 'Paste a decklist of up to 100,000 characters.',
				importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
			});
		return {
			preview: await application.decks.previewMtgImport(locals.user!, text, deck.format),
			importText: text,
			importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
		};
	}),
	commitImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, {
				message: 'Paste a decklist of up to 100,000 characters.',
				importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
			});
		try {
			await importIntoDeck(locals.user!, {
				deckId: field(form, 'deckId'),
				text,
				requestId: field(form, 'requestId')
			});
		} catch (cause) {
			if (
				cause instanceof RequestConflictError ||
				(cause instanceof ValidationError && !(cause instanceof DeckNotFoundError))
			)
				return fail(cause instanceof RequestConflictError ? 409 : 400, {
					message: cause.message,
					importDraft: { text: String(form.get('text') ?? ''), requestId: field(form, 'requestId') }
				});
			throw cause;
		}
		return { success: true, imported: true, message: 'Resolved cards added to the deck.' };
	})
} satisfies Actions;
