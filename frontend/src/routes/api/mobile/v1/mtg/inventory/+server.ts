import { inventoryApplication, inventoryQueryFromUrl } from '#lib/server/data/inventory-window.ts';
import type { RequestHandler } from './$types';
import { readString, readNumber, readJsonObject } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { batchAddInventory } from '#lib/server/mobile/mtg-service.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const page = await inventoryApplication.page(
			auth.user,
			inventoryQueryFromUrl(event.url),
			event.url.searchParams.get('revision') ?? undefined
		);
		return json(page, { status: page.kind === 'RevisionChanged' ? 409 : 200 });
	} catch (cause) {
		badRequestIfValidation(cause);
	}
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
			return {
				catalogCardId: readString(input.catalogCardId, 'catalogCardId'),
				finish: readString(input.finish, 'finish', 'nonfoil'),
				condition: readString(input.condition, 'condition', 'NM'),
				quantity: readNumber(input.quantity, 'quantity', 1),
				...(Object.hasOwn(input, 'notes')
					? {
							notes: readString(input.notes, 'notes'),
							...(Object.hasOwn(input, 'notesRevision')
								? { notesRevision: readString(input.notesRevision, 'notesRevision') }
								: {})
						}
					: {})
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
