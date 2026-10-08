import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { requireUuid, readQueryInteger } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			await application.categories.getCategoryPreview(auth.user, {
				previewId: requireUuid(event.params.previewId),
				offset: readQueryInteger(
					event.url.searchParams.get('offset'),
					'offset',
					0,
					Number.MAX_SAFE_INTEGER,
					0
				),
				limit: readQueryInteger(event.url.searchParams.get('limit'), 'limit', 50, 100, 1)
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
