import { normalizeQuantity } from '$lib/server/mtg/validation';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { readString, readJsonObject, requireUuid, readNumber } from '$lib/server/http/request';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { removeInventoryEntry, updateInventoryEntry } from '$lib/server/mobile/mtg-service';

export const PATCH = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');
	const body = await readJsonObject(event.request);

	try {
		return json(
			await updateInventoryEntry(
				auth,
				entryId,
				normalizeQuantity(readNumber(body.quantity, 'quantity', 1)),
				readString(body.notes, 'notes', '')
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const DELETE = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');

	return json(await removeInventoryEntry(auth, entryId));
};
