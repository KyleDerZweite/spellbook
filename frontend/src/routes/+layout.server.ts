import type { LayoutServerLoad } from './$types';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isGame } from '$lib/state/activeGame.svelte';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const cookieGame = cookies.get(ACTIVE_GAME_COOKIE);
	const activeGame = isGame(cookieGame) ? cookieGame : DEFAULT_GAME;

	return {
		user: locals.user,
		spacetimeToken: locals.spacetimeToken,
		meiliSearchKey: locals.meiliSearchKey,
		activeGame
	};
};
