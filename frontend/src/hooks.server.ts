import type { Handle } from '@sveltejs/kit/hooks';
import { error } from '@sveltejs/kit';
import { RemoteClient } from '#lib/server/remote/client.ts';
import { remoteConfiguration } from '#lib/server/remote/config.ts';
import { RemoteError } from '#lib/server/remote/errors.ts';
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
	'/mtg/categories',
	'/mtg/scan',
	'/settings',
	'/app/connect'
];
const NO_INDEX_PATH_PREFIXES = ['/auth/', '/api/', '/mtg/', '/settings', '/app'];

function isPublicPath(pathname: string): boolean {
	return pathname === '/' || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
	return PROTECTED_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	// The API authenticates the raw request and owns its Origin and cache policy.
	if (pathname.startsWith('/api/') || pathname === '/openapi.json') {
		const response = await resolve(event);
		response.headers.set('X-Robots-Tag', NO_INDEX_ROBOTS_TAG);
		return response;
	}
	requireFormOrigin(event);

	if (pathname === '/mtg' || pathname === '/mtg/') {
		return createNoIndexRedirect(`/mtg/search${event.url.search}`, 308);
	}

	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.api = new RemoteClient({
		get apiUrl() {
			return remoteConfiguration(event.url).apiUrl;
		},
		get publicOrigin() {
			return remoteConfiguration(event.url).publicOrigin;
		},
		get clientAddress() {
			return event.getClientAddress();
		},
		token,
		signal: event.request.signal
	});
	let session;
	try {
		session = await validateSession(token);
	} catch (cause) {
		if (cause instanceof RemoteError) error(cause.status, cause.message);
		throw cause;
	}
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
	if (pathname.startsWith('/auth/') || pathname === '/app' || pathname.startsWith('/app/')) {
		response.headers.set('Cache-Control', 'no-store');
		response.headers.set('Referrer-Policy', 'no-referrer');
	}
	if (NO_INDEX_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		response.headers.set('X-Robots-Tag', NO_INDEX_ROBOTS_TAG);
	}

	return response;
};
