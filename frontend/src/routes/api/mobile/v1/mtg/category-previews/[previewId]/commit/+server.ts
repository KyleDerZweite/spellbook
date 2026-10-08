import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { requireUuid, readJsonObject } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event),
		body = await readJsonObject(event.request, 65536);
	if (Object.keys(body).some((k) => k !== 'requestId'))
		error(400, 'Unsupported category request fields');
	try {
		return json(
			await application.categories.commitCategoryChange(auth.user, {
				...body,
				previewId: requireUuid(event.params.previewId)
			} as Parameters<typeof application.categories.commitCategoryChange>[1])
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
