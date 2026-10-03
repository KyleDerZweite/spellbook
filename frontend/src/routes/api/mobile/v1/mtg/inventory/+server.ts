import type { RequestHandler } from './$types';
import { readString, readNumber, readJsonObject } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { getInventorySnapshotEntry, batchAddInventory } from '#lib/server/mobile/mtg-service.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { assertInventoryOperation } from '#lib/server/mtg/validation.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getInventorySnapshotEntry(auth));
};

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	if (!body?.requestId || !Array.isArray(body?.items)) {
		throw error(400, 'requestId and items are required');
	}

	try {
		const items = body.items.map((item: unknown) => {
			if (!item || typeof item !== 'object' || Array.isArray(item))
				error(400, 'Each inventory item must be an object');
			const input = item as Record<string, unknown>;
			const operation = assertInventoryOperation({
				op: 'add',
				card: input,
				finish: input.finish,
				condition: input.condition,
				quantity: readNumber(input.quantity, 'quantity', 1)
			});
			if (operation.op !== 'add') error(400, 'Expected an inventory add');
			return {
				...operation.card,
				finish: operation.finish,
				condition: operation.condition,
				quantity: operation.quantity
			};
		});
		return json(
			await batchAddInventory(auth, {
				requestId: readString(body.requestId, 'requestId'),
				source: readString(body.source, 'source', 'mobile'),
				items
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
