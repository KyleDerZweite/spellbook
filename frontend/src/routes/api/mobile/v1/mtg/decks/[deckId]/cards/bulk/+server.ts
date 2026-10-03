import { readString, readJsonObject, requireUuid } from '$lib/server/http/request';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { bulkMutateDeckCards } from '$lib/server/mobile/mtg-service';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
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
