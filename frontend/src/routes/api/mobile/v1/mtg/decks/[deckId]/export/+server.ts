import { error } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getDeckCardsEntry } from '$lib/server/mobile/mtg-service';
import { formatArenaDecklist } from '$lib/server/mtg/decklist';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = event.params.deckId?.trim();
	const format = event.url.searchParams.get('format') ?? 'arena';
	if (!deckId) {
		throw error(400, 'deckId is required');
	}
	if (format !== 'arena') {
		throw error(400, 'Only arena export is supported');
	}

	return new Response(formatArenaDecklist(await getDeckCardsEntry(auth, deckId)), {
		headers: {
			'content-type': 'text/plain; charset=utf-8'
		}
	});
};
