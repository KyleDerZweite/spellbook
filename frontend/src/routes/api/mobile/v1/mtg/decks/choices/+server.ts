import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { readQueryInteger } from '#lib/server/http/request.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const params = event.url.searchParams;
	for (const key of params.keys())
		if (
			!['query', 'offset', 'limit', 'selectedDeckId'].includes(key) ||
			params.getAll(key).length !== 1
		)
			error(400, 'Invalid Deck choice query');
	try {
		return json(
			await application.decks.getDeckChoices(auth.user, {
				query: params.get('query') ?? undefined,
				offset: readQueryInteger(params.get('offset'), 'offset', 0, 1_000_000),
				limit: readQueryInteger(params.get('limit'), 'limit', 20, 50, 1),
				selectedDeckId: params.get('selectedDeckId') ?? undefined
			}),
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
