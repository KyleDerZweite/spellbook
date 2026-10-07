import { inventoryApplication } from '#lib/server/data/inventory-window.ts';
import type { RequestHandler } from './$types';
import { normalizeQuantity } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readString, readJsonObject, requireUuid, readNumber } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { removeInventoryEntry, updateInventoryEntry } from '#lib/server/mobile/mtg-service.ts';

export const PATCH: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');
	const body = await readJsonObject(event.request);

	try {
		return json(
			await updateInventoryEntry(auth, {
				requestId: readString(body.requestId, 'requestId'),
				entryId,
				...(Object.hasOwn(body, 'quantity')
					? { quantity: normalizeQuantity(readNumber(body.quantity, 'quantity')) }
					: {}),
				...(Object.hasOwn(body, 'delta')
					? { delta: normalizeQuantity(readNumber(body.delta, 'delta')) }
					: {}),
				...(Object.hasOwn(body, 'notes')
					? {
							notes: readString(body.notes, 'notes'),
							notesRevision: readString(body.notesRevision, 'notesRevision')
						}
					: {}),
				source: 'mobile'
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = requireUuid(event.params.entryId, 'entryId');

	const body = await readJsonObject(event.request);
	try {
		return json(
			await removeInventoryEntry(auth, {
				entryId,
				requestId: readString(body.requestId, 'requestId'),
				expectedQuantity: readNumber(body.expectedQuantity, 'expectedQuantity'),
				source: 'mobile'
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const detail = await inventoryApplication.getEntry(
			auth.user,
			requireUuid(event.params.entryId, 'entryId')
		);
		if (!detail) error(404, 'Inventory entry not found');
		return json(detail);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
