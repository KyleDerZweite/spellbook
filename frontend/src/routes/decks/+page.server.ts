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
	searchDeckCatalog,
	getDeckLegality,
	importIntoDeck
} from '#lib/server/mtg/deck-builder.ts';
import { getPrintings } from '#lib/server/catalog/search.ts';
import { previewMtgImport } from '#lib/server/mtg/import.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import type { CardDocument } from '#lib/search/types.ts';
import type { LegalityWarning } from '#lib/server/mtg/legality.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
	const snapshot = await getDeckSnapshot(locals.user.accountId, 'mtg');
	const selectedDeckId = url.searchParams.get('deck') ?? snapshot.decks[0]?.id ?? null;
	const selectedDeck = snapshot.decks.find((deck) => deck.id === selectedDeckId);
	if (selectedDeckId && !selectedDeck) throw error(404, 'Deck not found');
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const oracleId = url.searchParams.get('printing') ?? '';
	let catalogCards: CardDocument[] = [];
	let catalogError = '';
	let warnings: LegalityWarning[] = [];
	let legalityError = '';
	await Promise.all([
		(async () => {
			if (!query && !oracleId) return;
			try {
				if (oracleId && !/^[0-9a-f-]{36}$/i.test(oracleId)) {
					catalogError = 'Select a card to view its printings.';
					return;
				}
				const result = oracleId ? await getPrintings(oracleId) : await searchDeckCatalog(query);
				catalogCards = result.hits;
			} catch {
				catalogError = 'The card catalog is unavailable. You can still edit your deck.';
			}
		})(),
		(async () => {
			if (!selectedDeck) return;
			try {
				warnings = await getDeckLegality(
					snapshot.deckCards.filter((card) => card.deckId === selectedDeck.id),
					selectedDeck.format
				);
			} catch {
				legalityError =
					'Card legality could not be checked. Try again when the catalog is available.';
			}
		})()
	]);
	return {
		...snapshot,
		selectedDeckId,
		query,
		oracleId,
		catalogCards,
		catalogError,
		warnings,
		legalityError
	};
};

function guarded(action: Action): Action {
	return async (event) => {
		if (!event.locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		try {
			return await action(event);
		} catch (cause) {
			if (isRedirect(cause) || isHttpError(cause)) throw cause;
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
		const deck = await createDeckRecord(locals.user!.accountId, {
			game: 'mtg',
			name: field(form, 'name'),
			description: field(form, 'description'),
			format: field(form, 'format')
		});
		throw redirect(303, `/decks?deck=${encodeURIComponent(deck.id)}`);
	}),
	updateDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const deck = await updateDeck(locals.user!.accountId, {
			deckId: field(form, 'deckId'),
			name: field(form, 'name'),
			description: field(form, 'description'),
			format: field(form, 'format')
		});
		if (!deck) return fail(404, { message: 'Deck not found.' });
		return { success: true, message: 'Deck details saved.' };
	}),
	deleteDeck: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await deleteDeck(locals.user!.accountId, field(form, 'deckId'));
		throw redirect(303, '/decks');
	}),
	addCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await addCatalogCardToDeck(locals.user!.accountId, {
			deckId: field(form, 'deckId'),
			catalogCardId: field(form, 'catalogCardId'),
			quantity: Number(form.get('quantity') ?? 1),
			role: field(form, 'role'),
			requestId: field(form, 'requestId')
		});
		return { success: true, message: 'Card added to deck.' };
	}),
	updateCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await updateDeckCard(
			locals.user!.accountId,
			field(form, 'entryId'),
			Number(form.get('quantity')),
			field(form, 'role')
		);
		return { success: true, message: 'Card updated.' };
	}),
	removeCard: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		await removeDeckCard(locals.user!.accountId, field(form, 'entryId'));
		return { success: true, message: 'Card removed from deck.' };
	}),
	previewImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const snapshot = await getDeckSnapshot(locals.user!.accountId, 'mtg');
		const deck = snapshot.decks.find((entry) => entry.id === field(form, 'deckId'));
		if (!deck) return fail(404, { message: 'Deck not found.' });
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, { message: 'Paste a decklist of up to 100,000 characters.' });
		return { preview: await previewMtgImport(text, deck.format), importText: text };
	}),
	commitImport: guarded(async ({ request, locals }) => {
		const form = await request.formData();
		const text = field(form, 'text');
		if (!text || text.length > 100_000)
			return fail(400, { message: 'Paste a decklist of up to 100,000 characters.' });
		await importIntoDeck(locals.user!.accountId, {
			deckId: field(form, 'deckId'),
			text,
			requestId: field(form, 'requestId')
		});
		return { success: true, imported: true, message: 'Resolved cards added to the deck.' };
	})
} satisfies Actions;
