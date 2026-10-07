import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, readString } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const PATCH: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.inventory.renameGroup(auth.user, {
				requestId: readString(body.requestId, 'requestId'),
				groupId: event.params.groupId!,
				name: readString(body.name, 'name')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.inventory.deleteGroup(auth.user, {
				requestId: readString(body.requestId, 'requestId'),
				groupId: event.params.groupId!
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
