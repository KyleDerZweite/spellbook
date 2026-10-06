import type { RequestHandler } from './$types';
import { requireUuid } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { error } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { exportDecklist } from '#lib/server/mtg/deck-builder.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');
	const format = event.url.searchParams.get('format') ?? 'arena';
	if (format !== 'arena') {
		throw error(400, 'Only arena export is supported');
	}

	try {
		return new Response(await exportDecklist(auth.user, deckId), {
			headers: {
				'content-type': 'text/plain; charset=utf-8'
			}
		});
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
