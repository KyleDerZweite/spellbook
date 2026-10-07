import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject, readString } from '#lib/server/http/request.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const page = await application.inventory.page(auth.user, {
			view: 'groups',
			offset: Number(event.url.searchParams.get('offset') ?? 0),
			limit: Number(event.url.searchParams.get('limit') ?? 50)
		});
		if (page.kind !== 'Page') throw new Error('Initial Groups must be current');
		return json({ revision: page.revision, groups: page.groupPage, count: page.groupCount });
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.inventory.createGroup(auth.user, {
				requestId: readString(body.requestId, 'requestId'),
				name: readString(body.name, 'name')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
