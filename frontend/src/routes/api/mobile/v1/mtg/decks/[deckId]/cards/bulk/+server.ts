import type { RequestHandler } from './$types';
import { readString, readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { bulkMutateDeckCards } from '#lib/server/mobile/mtg-service.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');
	const body = await readJsonObject(event.request);

	try {
		return json(
			await bulkMutateDeckCards(auth, {
				deckId,
				requestId: readString(body.requestId, 'requestId', ''),
				source: readString(body.source, 'source', 'mobile'),
				operations: body?.operations
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck bulk request');
	}
};
