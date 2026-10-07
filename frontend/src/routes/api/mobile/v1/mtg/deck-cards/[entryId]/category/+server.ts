import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { requireUuid, readJsonObject } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const PATCH: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request, 16384);
	if (
		Object.keys(body).some(
			(k) => !['deckId', 'categoryId', 'expectedDecisionRevision', 'requestId'].includes(k)
		)
	)
		throw error(400, 'Unsupported category request fields');
	try {
		return json(
			await application.categories.setEntryCategory(auth.user, {
				...body,
				entryId: requireUuid(event.params.entryId)
			} as Parameters<typeof application.categories.setEntryCategory>[1])
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
