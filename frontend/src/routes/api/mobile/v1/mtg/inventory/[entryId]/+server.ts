import type { RequestHandler } from './$types';
import { normalizeQuantity } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readString, readJsonObject, requireUuid, readNumber } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { removeInventoryEntry, updateInventoryEntry } from '#lib/server/mobile/mtg-service.ts';

export const PATCH: RequestHandler = async (event) => {
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

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');

	return json(await removeInventoryEntry(auth, entryId));
};
