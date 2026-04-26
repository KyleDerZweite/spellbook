import type { PageServerLoad } from './$types';
import { getHomeSummary } from '$lib/server/data/inventory';
import { DEFAULT_GAME } from '$lib/state/activeGame.svelte';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { activeGame } = await parent();
	if (!locals.user) {
		return {
			stats: { total: 0, unique: 0, foils: 0, sets: 0, completedSets: 0 },
			recentAdditions: []
		};
	}

	return getHomeSummary(locals.user.accountId, activeGame ?? DEFAULT_GAME);
};
