import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { bulkMutateDeckCards } from '$lib/server/mobile/mtg-service';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = event.params.deckId?.trim();
	const body = await event.request.json();
	if (!deckId) {
		throw error(400, 'deckId is required');
	}

	try {
		return json(
			await bulkMutateDeckCards(auth, {
				deckId,
				requestId: String(body?.requestId ?? ''),
				source: String(body?.source ?? 'mobile'),
				operations: body?.operations
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck bulk request');
	}
};
