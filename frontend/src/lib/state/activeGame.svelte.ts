import type { Game } from '$lib/search/types';

export const ACTIVE_GAME_COOKIE = 'spellbook_game';
export const DEFAULT_GAME: Game = 'mtg';

/** Games the product recognises. Only `mtg` is wired end-to-end today. */
export const SUPPORTED_GAMES: Game[] = ['mtg', 'pokemon', 'yugioh'];

/** Games that actually have catalog + inventory support right now. */
export const AVAILABLE_GAMES: Game[] = ['mtg'];

export function isGame(value: unknown): value is Game {
	return typeof value === 'string' && (SUPPORTED_GAMES as string[]).includes(value);
}

/**
 * Reactive active-game state. The active game now lives in client state
 * (persisted to a cookie server-side) rather than in the URL, so the user
 * sees flat routes (`/search`, `/inventory`) but every data call still
 * scopes to a specific game.
 *
 * Only `mtg` is a valid value today; picking a disabled game in the
 * GameSwitcher is a no-op and must not call `set`.
 */
class ActiveGameState {
	current: Game = $state(DEFAULT_GAME);

	set(game: Game): void {
		if (!AVAILABLE_GAMES.includes(game)) {
			return;
		}
		this.current = game;
		if (typeof document !== 'undefined') {
			const oneYear = 60 * 60 * 24 * 365;
			document.cookie = `${ACTIVE_GAME_COOKIE}=${game}; path=/; max-age=${oneYear}; samesite=lax`;
		}
	}

	/** Server hook seeds this from the request cookie on load. */
	hydrate(game: Game | null | undefined): void {
		if (game && AVAILABLE_GAMES.includes(game)) {
			this.current = game;
		}
	}
}

export const activeGameState = new ActiveGameState();
