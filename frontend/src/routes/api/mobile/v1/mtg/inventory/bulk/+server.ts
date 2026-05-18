import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { bulkMutateInventory } from '$lib/server/mobile/mtg-service';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	try {
		return json(
			await bulkMutateInventory(auth, {
				requestId: String(body?.requestId ?? ''),
				source: String(body?.source ?? 'mobile'),
				operations: body?.operations
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid inventory bulk request');
	}
};
