import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event),
		body = await readJsonObject(event.request, 65536);
	if (
		Object.keys(body).some((k) => !['requestId', 'expectedLibraryRevision', 'archived'].includes(k))
	)
		error(400, 'Unsupported category request fields');
	try {
		return json(
			await application.categories.archiveDefinition(auth.user, {
				...body,
				originId: requireUuid(event.params.originId)
			} as Parameters<typeof application.categories.archiveDefinition>[1])
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
