import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { inventoryApplication, inventoryQueryFromUrl } from '#lib/server/data/inventory-window.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const revision = event.url.searchParams.get('revision');
		if (!revision) error(400, 'revision is required');
		const result = await inventoryApplication.locate(
			auth.user,
			inventoryQueryFromUrl(event.url),
			event.params.entryId,
			revision
		);
		return json(result, { status: result.kind === 'RevisionChanged' ? 409 : 200 });
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
