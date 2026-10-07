import { requireUuid } from '#lib/server/http/request.ts';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { inventoryApplication, inventoryQueryFromUrl } from '#lib/server/data/inventory-window.ts';
export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
	const detail = await inventoryApplication.getEntry(
		locals.user,
		requireUuid(params.entryId, 'entryId')
	);
	if (!detail) error(404, 'Inventory entry not found');
	const groups = await inventoryApplication.page(locals.user, {
		...inventoryQueryFromUrl(url),
		view: 'groups',
		group: null
	});
	if (groups.kind !== 'Page') throw new Error('Initial Groups must be current');
	return {
		detail,
		groups: groups.groups,
		requestIds: {
			notes: crypto.randomUUID(),
			groups: crypto.randomUUID(),
			remove: crypto.randomUUID()
		},
		returnTo: '/mtg/inventory' + url.search
	};
};
