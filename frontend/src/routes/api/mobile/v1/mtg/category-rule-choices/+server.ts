import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const query = event.url.searchParams;
	try {
		return json(
			await application.categories.getRuleChoices(auth.user, {
				tagQuery: query.get('tagQuery') ?? undefined,
				cardQuery: query.get('cardQuery') ?? undefined,
				outcomeQuery: query.get('outcomeQuery') ?? undefined,
				tagIds: query.getAll('tagId'),
				oracleIds: query.getAll('oracleId'),
				outcomeIds: query.getAll('outcomeId')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
