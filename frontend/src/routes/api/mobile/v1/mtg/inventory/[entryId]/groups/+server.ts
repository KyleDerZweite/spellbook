import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, readString } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const PUT: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.inventory.replaceMemberships(auth.user, {
				requestId: readString(body.requestId, 'requestId'),
				entryId: event.params.entryId!,
				groupIds: body.groupIds as string[]
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
