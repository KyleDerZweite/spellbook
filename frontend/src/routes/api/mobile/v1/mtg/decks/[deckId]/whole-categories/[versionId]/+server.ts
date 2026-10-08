import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { requireUuid, readJsonObject, readString } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const PATCH: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		const input = {
			requestId: requireUuid(body.requestId),
			deckId: requireUuid(event.params.deckId),
			versionId: requireUuid(event.params.versionId),
			expectedDecisionRevision: readString(
				body.expectedDecisionRevision,
				'expectedDecisionRevision'
			)
		};
		if (body.name !== undefined)
			return json(
				await application.categories.renameWholeCategory(auth.user, {
					...input,
					name: readString(body.name, 'name')
				})
			);
		if (body.manual !== 'Include' && body.manual !== 'Exclude')
			throw error(400, 'Select Include or Exclude');
		return json(
			await application.categories.setWholeCategory(auth.user, { ...input, manual: body.manual })
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
			await application.categories.removeWholeCategory(auth.user, {
				requestId: requireUuid(body.requestId),
				deckId: requireUuid(event.params.deckId),
				versionId: requireUuid(event.params.versionId),
				expectedDecisionRevision: readString(
					body.expectedDecisionRevision,
					'expectedDecisionRevision'
				)
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
