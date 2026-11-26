import { translate } from '#lib/i18n/messages.ts';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { application } from '#lib/server/composition.ts';
import { DeckNotFoundError } from '#lib/server/remote/errors.ts';
import { getDeckLegality } from '#lib/server/mtg/deck-builder.ts';
import type { CardDocument } from '#lib/search/types.ts';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	if (!locals.user) {
		throw redirect(
			303,
			`/auth/login?returnTo=${encodeURIComponent(`/mtg/decks/${params.deckId}/playtest`)}`
		);
	}
	setHeaders({ 'cache-control': 'no-store' });
	try {
		const snapshot = await application.decks.getDeck(locals.user, params.deckId);
		const deck = snapshot.decks.find((entry) => entry.id === params.deckId);
		if (!deck) throw error(404, translate(locals.locale, 'notice.Deck.not.found'));
		let documents: Record<string, CardDocument> = {};
		try {
			const legality = await getDeckLegality(locals.user, deck.id);
			documents = legality.deckDocuments;
		} catch {
			documents = {};
		}
		return { deck, cards: snapshot.deckCards, documents };
	} catch (cause) {
		if (cause instanceof DeckNotFoundError)
			throw error(404, translate(locals.locale, 'notice.Deck.not.found'));
		throw cause;
	}
};
