import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDeckSnapshot, DeckNotFoundError } from '#lib/server/data/decks.ts';
import { exportDecklist } from '#lib/server/mtg/deck-builder.ts';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
	let snapshot;
	try {
		snapshot = await getDeckSnapshot(locals.user, 'mtg', params.deckId);
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		throw cause;
	}
	const deck = snapshot.decks.find((entry) => entry.id === params.deckId);
	if (!deck) throw error(404, 'Deck not found');
	const text = await exportDecklist(locals.user, deck.id);
	return new Response(text, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'content-disposition': `attachment; filename="${deck.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'deck'}.txt"`
		}
	});
};
