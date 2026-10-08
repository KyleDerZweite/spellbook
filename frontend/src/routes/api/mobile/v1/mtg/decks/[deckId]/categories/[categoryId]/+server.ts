import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
async function command(event: Parameters<RequestHandler>[0], remove: boolean) {
	const auth = await requireMobileAuth(event),
		body = await readJsonObject(event.request, 65536);
	if (
		Object.keys(body).some(
			(k) =>
				![
					'requestId',
					'expectedDecisionRevision',
					remove ? 'replacementCategoryId' : 'name'
				].includes(k)
		)
	)
		error(400, 'Unsupported category request fields');
	const input = {
		...body,
		deckId: requireUuid(event.params.deckId),
		categoryId: requireUuid(event.params.categoryId)
	};
	try {
		return json(
			remove
				? await application.categories.removeLocalCategory(
						auth.user,
						input as Parameters<typeof application.categories.removeLocalCategory>[1]
					)
				: await application.categories.renameLocalCategory(
						auth.user,
						input as Parameters<typeof application.categories.renameLocalCategory>[1]
					)
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
}
export const PATCH: RequestHandler = (event) => command(event, false);
export const DELETE: RequestHandler = (event) => command(event, true);
