import type { Handle } from '@sveltejs/kit/hooks';
import { requireFormOrigin } from '#lib/server/auth/csrf.ts';
import { NO_INDEX_ROBOTS_TAG, createNoIndexRedirect } from '#lib/seo/site.ts';
import { SESSION_COOKIE, clearSessionCookie, validateSession } from '#lib/server/auth/session.ts';
import { ACTIVE_GAME_COOKIE, DEFAULT_GAME, isAvailableGame } from '#lib/state/activeGame.svelte.ts';

const PUBLIC_PATH_PREFIXES = ['/auth/', '/privacy', '/terms'];
const PROTECTED_PATH_PREFIXES = [
	'/mtg/dashboard',
	'/mtg/history',
	'/mtg/inventory',
	'/mtg/decks',
	'/mtg/scan',
	'/settings'
];
const NO_INDEX_PATH_PREFIXES = ['/auth/', '/api/', '/mtg/', '/settings'];
const LEGACY_PAGE_PATHS = ['/search', '/inventory', '/decks', '/scan'];

function isPublicPath(pathname: string): boolean {
	return pathname === '/' || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
	return PROTECTED_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
	);
}

function resolveLegacyRedirect(pathname: string): string | null {
	if (pathname === '/mtg' || pathname === '/mtg/') return '/mtg/search';
	if (pathname === '/collections' || pathname === '/collections/') return '/mtg/inventory';
	if (LEGACY_PAGE_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
		return `/mtg${pathname}`;
	}
	return null;
}

function buildRedirectResponse(location: string): Response {
	// 308 preserves methods and bodies while old links move to game-prefixed routes.
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

	// Redirect old page URLs before applying the destination auth guard.
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
		if (!isAvailableGame(existing)) {
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
