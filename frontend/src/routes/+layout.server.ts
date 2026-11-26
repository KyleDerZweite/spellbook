import { demoLoginEnabled, demoMode } from '#lib/server/auth/demo.ts';
import { registrationOpen } from '#lib/server/auth/registration.ts';
import { configuredSocialLinks } from '#lib/server/social.ts';
import type { LayoutServerLoad } from './$types';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isAvailableGame } from '#lib/state/activeGame.svelte.ts';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const cookieGame = cookies.get(ACTIVE_GAME_COOKIE);
	const activeGame = isAvailableGame(cookieGame) ? cookieGame : DEFAULT_GAME;

	return {
		locale: locals.locale,
		user: locals.user,
		demoMode,
		demoLoginEnabled,
		registrationOpen: registrationOpen(),
		activeGame,
		socialLinks: configuredSocialLinks
	};
};
