import type { PageServerLoad } from './$types';
import { getHomeSummary } from '#lib/server/data/inventory.ts';
import { getRecentDecks } from '#lib/server/data/decks.ts';
import { DEFAULT_GAME } from '#lib/state/activeGame.svelte.ts';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { activeGame } = await parent();
	if (!locals.user) {
		return {
			stats: { total: 0, unique: 0, foils: 0, sets: 0, completedSets: 0 },
			recentAdditions: [],
			recentDecks: []
		};
	}

	const [summary, recentDecks] = await Promise.all([
		getHomeSummary(locals.user.accountId, activeGame ?? DEFAULT_GAME),
		getRecentDecks(locals.user.accountId, activeGame ?? DEFAULT_GAME)
	]);
	return { ...summary, recentDecks };
};
