import type { Handle } from '@sveltejs/kit/hooks';
import { requireFormOrigin } from '#lib/server/auth/csrf.ts';
import { NO_INDEX_ROBOTS_TAG, createNoIndexRedirect } from '#lib/seo/site.ts';
import { SESSION_COOKIE, clearSessionCookie, validateSession } from '#lib/server/auth/session.ts';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isGame } from '#lib/state/activeGame.svelte.ts';

const PUBLIC_PATH_PREFIXES = ['/auth/', '/privacy', '/terms'];
const PROTECTED_PATH_PREFIXES = ['/search', '/inventory', '/decks', '/scan'];
const NO_INDEX_PATH_PREFIXES = ['/auth/', '/api/', '/search', '/inventory', '/decks', '/scan'];

/**
 * Paths under `/mtg/*` used to be canonical. They are now redirected to
 * flat root-level paths. The game identity lives in a cookie (see
 * `activeGameState`), not the URL.
 */
const LEGACY_MTG_REDIRECTS: Record<string, string> = {
	'/mtg': '/',
	'/mtg/': '/',
	'/mtg/search': '/search',
	'/mtg/inventory': '/inventory',
	'/mtg/decks': '/decks'
};

/** Legacy transitional aliases that used to forward into `/mtg/*`. */
const LEGACY_ALIAS_REDIRECTS: Record<string, string> = {
	'/collections': '/inventory',
	'/collections/': '/inventory'
};

function isPublicPath(pathname: string): boolean {
	return pathname === '/' || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
	return PROTECTED_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
	);
}

function resolveLegacyRedirect(pathname: string): string | null {
	if (pathname in LEGACY_MTG_REDIRECTS) return LEGACY_MTG_REDIRECTS[pathname];
	if (pathname in LEGACY_ALIAS_REDIRECTS) return LEGACY_ALIAS_REDIRECTS[pathname];
	return null;
}

function buildRedirectResponse(location: string): Response {
	// 308 preserves method and the request body; bookmarks and external
	// links to the old `/mtg/*` URLs will land on the new flat routes.
	return new Response(null, {
		status: 308,
		headers: {
			Location: location,
			'X-Robots-Tag': NO_INDEX_ROBOTS_TAG
		}
	});
}

export const handle: Handle = async ({ event, resolve }) => {
	requireFormOrigin(event);
	const pathname = event.url.pathname;

	// Legacy route redirects must run before auth protection so signed-out
	// users bounce straight to the new flat URL (which then guards itself).
	const legacyTarget = resolveLegacyRedirect(pathname);
	if (legacyTarget) {
		const search = event.url.search;
		return buildRedirectResponse(`${legacyTarget}${search}`);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	const session = await validateSession(token);
	if (token && !session) clearSessionCookie(event.cookies);
	event.locals.user = session;
	event.locals.mobileBearerUser = null;

	// Seed the active-game cookie on first visit so the client has a
	// deterministic starting point without a flash of content.
	if (!event.cookies.get(ACTIVE_GAME_COOKIE)) {
		event.cookies.set(ACTIVE_GAME_COOKIE, DEFAULT_GAME, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			sameSite: 'lax'
		});
	} else {
		const existing = event.cookies.get(ACTIVE_GAME_COOKIE);
		if (!isGame(existing)) {
			event.cookies.set(ACTIVE_GAME_COOKIE, DEFAULT_GAME, {
				path: '/',
				maxAge: 60 * 60 * 24 * 365,
				sameSite: 'lax'
			});
		}
	}

	if (!isPublicPath(pathname) && isProtectedPath(pathname) && !session) {
		const returnTo = `${pathname}${event.url.search}`;
		return createNoIndexRedirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
	}

	const response = await resolve(event);
	if (NO_INDEX_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		response.headers.set('X-Robots-Tag', NO_INDEX_ROBOTS_TAG);
	}

	return response;
};
