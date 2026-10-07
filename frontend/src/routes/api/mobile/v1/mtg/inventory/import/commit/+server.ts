import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { application } from '#lib/server/composition.ts';
import { normalizeSource, INVENTORY_SOURCES } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.inventory.commitImport(auth.user, {
				requestId: readString(body.requestId, 'requestId'),
				text: readString(body.text, 'text'),
				defaultFinish: readString(body.defaultFinish, 'defaultFinish', 'nonfoil'),
				defaultCondition: readString(body.defaultCondition, 'defaultCondition', 'NM'),
				source: normalizeSource(body.source, INVENTORY_SOURCES, 'import')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
