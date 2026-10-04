import type { RequestHandler } from './$types';
import { normalizeQuantity } from '#lib/server/mtg/validation.ts';
import { readString, readJsonObject, requireUuid, readNumber } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { removeDeckCardEntry, updateDeckCardEntry } from '#lib/server/mobile/mtg-service.ts';

export const PATCH: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');
	const body = await readJsonObject(event.request);

	try {
		return json(
			await updateDeckCardEntry(
				auth,
				entryId,
				normalizeQuantity(readNumber(body.quantity, 'quantity', 1)),
				body?.role === undefined ? undefined : readString(body.role, 'role')
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck card update');
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');

	return json(await removeDeckCardEntry(auth, entryId));
};
