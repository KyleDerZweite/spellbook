import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDeckSnapshot } from '$lib/server/data/decks';
import { exportDecklist } from '$lib/server/mtg/deck-builder';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
	const snapshot = await getDeckSnapshot(locals.user.accountId, 'mtg');
	const deck = snapshot.decks.find((entry) => entry.id === params.deckId);
	if (!deck) throw error(404, 'Deck not found');
	const text = await exportDecklist(snapshot.deckCards.filter((card) => card.deckId === deck.id));
	return new Response(text, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': `attachment; filename="${deck.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'deck'}.txt"`
		}
	});
};
