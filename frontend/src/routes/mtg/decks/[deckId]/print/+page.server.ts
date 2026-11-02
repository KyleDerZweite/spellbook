import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { application } from '#lib/server/composition.ts';
import { DeckNotFoundError } from '#lib/server/remote/errors.ts';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
	setHeaders({ 'cache-control': 'no-store' });
	try {
		const snapshot = await application.decks.getDeck(locals.user, params.deckId);
		const deck = snapshot.decks.find((entry) => entry.id === params.deckId);
		if (!deck) throw error(404, 'Deck not found');
		return { deck, cards: snapshot.deckCards, relatedTokens: snapshot.relatedTokens };
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		throw cause;
	}
};
