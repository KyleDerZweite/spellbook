import type { Handle } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import { NO_INDEX_ROBOTS_TAG, createNoIndexRedirect } from '$lib/seo/site';
import {
	getAuthSessionSecret,
	clearSessionCookie,
	readSessionCookie,
	writeSessionCookie
} from '$lib/server/auth/session';
import { getZitadelAuthConfig, refreshAuthSession } from '$lib/server/auth/zitadel';

let cachedSearchKey: string | null = null;
const SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const PUBLIC_PATH_PREFIXES = ['/auth/', '/privacy', '/terms'];
const PROTECTED_PATH_PREFIXES = ['/mtg', '/collections', '/search'];

/**
 * Fetch the default search API key from MeiliSearch by listing keys
 * and finding the one named "Default Search API Key".
 * Caches the result so it's only fetched once per server lifetime.
 */
async function getMeiliSearchKey(): Promise<string> {
	if (cachedSearchKey) return cachedSearchKey;

	const internalUrl = privateEnv.MEILISEARCH_INTERNAL_URL ?? 'http://localhost:7700';
	const masterKey = privateEnv.MEILI_MASTER_KEY;

	if (!masterKey) {
		console.warn('MEILI_MASTER_KEY not set — MeiliSearch search key cannot be fetched');
		return '';
	}

	try {
		const res = await fetch(`${internalUrl}/keys?limit=100`, {
			headers: { Authorization: `Bearer ${masterKey}` }
		});

		if (!res.ok) {
			console.error(`Failed to fetch MeiliSearch keys: ${res.status} ${res.statusText}`);
			return '';
		}

		const data = await res.json();
		const searchKey = data.results?.find(
			(k: { name: string; actions: string[] }) =>
				k.name === 'Default Search API Key' ||
				(k.actions?.length === 1 && k.actions[0] === 'search')
		);

		if (!searchKey?.key) {
			console.error('MeiliSearch default search key not found in /keys response');
			return '';
		}

		cachedSearchKey = searchKey.key;
		return cachedSearchKey!;
	} catch (err) {
		console.error('Failed to connect to MeiliSearch:', err);
		return '';
	}
}

/**
 * Refresh the encrypted auth session when the ID token is close to expiry.
 */
async function getActiveSession(event: Parameters<Handle>[0]['event']) {
	const sessionSecret = getAuthSessionSecret(privateEnv);
	const session = await readSessionCookie(event.cookies, sessionSecret);
	if (!session) {
		return null;
	}

	if (session.expiresAt > Date.now() + SESSION_REFRESH_WINDOW_MS) {
		return session;
	}

	try {
		const refreshed = await refreshAuthSession(getZitadelAuthConfig(privateEnv), session);
		await writeSessionCookie(event.cookies, sessionSecret, refreshed);
		return refreshed;
	} catch {
		clearSessionCookie(event.cookies);
		return null;
	}
}

function isPublicPath(pathname: string): boolean {
	return pathname === '/' || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtectedPath(pathname: string): boolean {
	return PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const handle: Handle = async ({ event, resolve }) => {
	const session = await getActiveSession(event);
	event.locals.user = session?.user ?? null;
	event.locals.spacetimeToken = session?.idToken ?? null;
	event.locals.meiliSearchKey = session ? await getMeiliSearchKey() : '';
	event.locals.mobileBearerUser = null;
	event.locals.mobileBearerToken = null;

	const pathname = event.url.pathname;
	if (!isPublicPath(pathname) && isProtectedPath(pathname) && !session) {
		const returnTo = `${pathname}${event.url.search}`;
		return createNoIndexRedirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
	}

	const response = await resolve(event);
	if (
		pathname.startsWith('/auth/') ||
		pathname.startsWith('/api/') ||
		pathname.startsWith('/mtg') ||
		pathname.startsWith('/collections') ||
		pathname.startsWith('/search')
	) {
		response.headers.set('X-Robots-Tag', NO_INDEX_ROBOTS_TAG);
	}

	return response;
};
