import { clampBrowsePagination } from '#lib/browsing/pagination.ts';
import { demoInventoryPage, readDemoInventory } from '#lib/demo/inventory.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, parent, depends }) => {
	const { demoSession } = await parent();
	if (!demoSession || typeof globalThis.window === 'undefined') return data;
	depends('demo:inventory');
	const state = await readDemoInventory(demoSession);
	if (!state) return data;
	let query = data.requestedDemoQuery ?? data.window.query;
	if (query.group && !state.groups.some(({ id }) => id === query.group)) {
		query = { ...query, group: null };
	}
	const projection = demoInventoryPage(state, query);
	const pagination = clampBrowsePagination(
		data.pagination,
		query.view === 'groups' && !query.group ? projection.groupCount : projection.matching.entryCount
	);
	const window =
		pagination.offset === query.offset
			? projection
			: demoInventoryPage(state, { ...query, offset: pagination.offset });
	return {
		...data,
		window,
		pagination,
		groups: window.groups,
		memberships: window.memberships,
		groupsView: window.query.view === 'groups',
		selectedGroupId: window.query.group,
		setNames: Object.fromEntries(window.sets.map(({ code, name }) => [code, name])),
		stats: {
			total: window.totals.copyCount,
			unique: window.totals.canonicalCardCount,
			foils: window.totals.foilEntryCount,
			sets: window.totals.setCount,
			completedSets: 0
		}
	};
};
