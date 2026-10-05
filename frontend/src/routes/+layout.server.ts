import { demoMode } from '#lib/server/auth/demo.ts';
import type { LayoutServerLoad } from './$types';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isAvailableGame } from '#lib/state/activeGame.svelte.ts';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const cookieGame = cookies.get(ACTIVE_GAME_COOKIE);
	const activeGame = isAvailableGame(cookieGame) ? cookieGame : DEFAULT_GAME;

	return {
		user: locals.user,
		demoMode,
		activeGame
	};
};
