import type { LayoutServerLoad } from './$types';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isGame } from '$lib/state/activeGame.svelte';
import { ensureUserProfile } from '$lib/server/data/users';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const cookieGame = cookies.get(ACTIVE_GAME_COOKIE);
	const activeGame = isGame(cookieGame) ? cookieGame : DEFAULT_GAME;
	if (locals.user) {
		await ensureUserProfile(locals.user);
	}

	return {
		user: locals.user,
		meiliSearchKey: locals.meiliSearchKey,
		activeGame
	};
};
