import { ValidationError } from '@spellbook/contracts/validation.ts';
import type { DeckExchangeFormat } from '@spellbook/contracts/decks.ts';
import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DeckNotFoundError } from '#lib/server/data/decks.ts';
import { application } from '#lib/server/composition.ts';
import { exportDecklist } from '#lib/server/mtg/deck-builder.ts';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/decks');
	let snapshot;
	try {
		snapshot = await application.decks.getDeck(locals.user, params.deckId);
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		throw cause;
	}
	const deck = snapshot.decks.find((entry) => entry.id === params.deckId);
	if (!deck) throw error(404, 'Deck not found');
	const format = url.searchParams.get('format') ?? 'arena';
	if (!['arena', 'simple', 'csv', 'json'].includes(format))
		throw error(400, 'Unsupported Deck export format');
	let text: string;
	try {
		text = await exportDecklist(locals.user, deck.id, format as DeckExchangeFormat);
	} catch (cause) {
		if (cause instanceof DeckNotFoundError) throw error(404, 'Deck not found');
		if (cause instanceof ValidationError) throw error(400, cause.message);
		throw cause;
	}
	const extension = format === 'json' || format === 'csv' ? format : 'txt';
	const media =
		format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain';
	return new Response(text, {
		headers: {
			'cache-control': 'no-store',
			'content-type': `${media}; charset=utf-8`,
			'content-disposition': `attachment; filename="${deck.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'deck'}.${extension}"`
		}
	});
};
