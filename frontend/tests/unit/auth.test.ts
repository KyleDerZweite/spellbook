import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_INDEX_ROBOTS_TAG } from '../../src/lib/seo/site';
import {
	readOAuthStateCookie,
	readSessionCookie,
	writeOAuthStateCookie,
	writeSessionCookie
} from '../../src/lib/server/auth/session';

const zitadelMocks = vi.hoisted(() => ({
	buildLogoutUrl: vi.fn(),
	exchangeAuthorizationCode: vi.fn(),
	getZitadelAuthConfig: vi.fn(),
	refreshAuthSession: vi.fn()
}));

vi.mock('$lib/env/private', () => ({
	privateEnv: {
		MEILI_MASTER_KEY: 'test-master-key',
		MEILISEARCH_INTERNAL_URL: 'http://localhost:7700',
		ZITADEL_ISSUER: 'https://auth.example.test',
		ZITADEL_CLIENT_ID: 'spellbook-client',
		APP_ORIGIN: 'https://spellbook.example.test',
		AUTH_SESSION_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY'
	}
}));

vi.mock('$lib/server/auth/zitadel', async () => {
	const actual = await vi.importActual<typeof import('../../src/lib/server/auth/zitadel')>(
		'../../src/lib/server/auth/zitadel'
	);

	return {
		...actual,
		buildLogoutUrl: zitadelMocks.buildLogoutUrl,
		exchangeAuthorizationCode: zitadelMocks.exchangeAuthorizationCode,
		getZitadelAuthConfig: zitadelMocks.getZitadelAuthConfig,
		refreshAuthSession: zitadelMocks.refreshAuthSession
	};
});

import { GET as callbackGet } from '../../src/routes/auth/callback/+server';
import { GET as loginGet } from '../../src/routes/auth/login/+server';
import { GET as logoutGet } from '../../src/routes/auth/logout/+server';
import { handle } from '../../src/hooks.server';

const AUTH_SECRET = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

function createCookies() {
	const store = new Map<string, string>();
	return {
		get(name: string) {
			return store.get(name);
		},
		set(name: string, value: string) {
			store.set(name, value);
		},
		delete(name: string) {
			store.delete(name);
		}
	};
}

describe('auth flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		zitadelMocks.getZitadelAuthConfig.mockReturnValue({
			issuer: 'https://auth.example.test',
			clientId: 'spellbook-client',
			appOrigin: 'https://spellbook.example.test'
		});
	});

	it('redirects protected routes to login when no session exists', async () => {
		const cookies = createCookies();

		const response = await handle({
			event: {
				url: new URL('https://spellbook.example.test/search?q=bolt'),
				cookies,
				locals: {},
				request: new Request('https://spellbook.example.test/search?q=bolt')
			},
			resolve: vi.fn()
		} as never);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fsearch%3Fq%3Dbolt');
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);
	});

	it('login redirect for an authenticated user includes noindex headers', async () => {
		const cookies = createCookies();

		const response = await loginGet({
			url: new URL('https://spellbook.example.test/auth/login?returnTo=/search'),
			cookies,
			locals: {
				user: { accountId: 'user-123', username: 'mage', email: 'mage@example.test' }
			}
		} as never);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/search');
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);
	});

	it('callback stores the encrypted session and redirects to returnTo', async () => {
		const cookies = createCookies();
		await writeOAuthStateCookie(cookies as never, AUTH_SECRET, {
			state: 'state-123',
			nonce: 'nonce-123',
			codeVerifier: 'verifier-123',
			returnTo: '/search'
		});

		zitadelMocks.exchangeAuthorizationCode.mockResolvedValue({
			user: { accountId: 'user-123', username: 'mage', email: 'mage@example.test' },
			idToken: 'id-token',
			refreshToken: 'refresh-token',
			expiresAt: Date.now() + 3600_000
		});

		const response = await callbackGet({
			url: new URL('https://spellbook.example.test/auth/callback?code=test-code&state=state-123'),
			cookies
		} as never);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/search');
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);

		const session = await readSessionCookie(cookies as never, AUTH_SECRET);
		const oauthState = await readOAuthStateCookie(cookies as never, AUTH_SECRET);

		expect(session?.user.accountId).toBe('user-123');
		expect(session?.idToken).toBe('id-token');
		expect(oauthState).toBeNull();
	});

	it('logout clears the session cookie and redirects to Zitadel end-session', async () => {
		const cookies = createCookies();
		await writeSessionCookie(cookies as never, AUTH_SECRET, {
			user: { accountId: 'user-123', username: 'mage', email: 'mage@example.test' },
			idToken: 'id-token',
			refreshToken: 'refresh-token',
			expiresAt: Date.now() + 3600_000
		});

		zitadelMocks.buildLogoutUrl.mockResolvedValue('https://auth.example.test/logout');

		const response = await logoutGet({ cookies } as never);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://auth.example.test/logout');
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);

		expect(await readSessionCookie(cookies as never, AUTH_SECRET)).toBeNull();
	});

	it('refreshes an expiring session in hooks and exposes locals', async () => {
		const cookies = createCookies();
		await writeSessionCookie(cookies as never, AUTH_SECRET, {
			user: { accountId: 'user-123', username: 'mage', email: 'mage@example.test' },
			idToken: 'stale-token',
			refreshToken: 'refresh-token',
			expiresAt: Date.now() + 1000
		});

		zitadelMocks.refreshAuthSession.mockResolvedValue({
			user: { accountId: 'user-123', username: 'mage', email: 'mage@example.test' },
			idToken: 'fresh-token',
			refreshToken: 'refresh-token',
			expiresAt: Date.now() + 3600_000
		});

		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					results: [{ name: 'Default Search API Key', actions: ['search'], key: 'search-key' }]
				})
			})
		);

		const locals: App.Locals = {
			user: null,
			meiliSearchKey: '',
			mobileBearerUser: null
		};

		const response = await handle({
			event: {
				url: new URL('https://spellbook.example.test/search'),
				cookies,
				locals,
				request: new Request('https://spellbook.example.test/search')
			},
			resolve: vi.fn(async () => new Response('ok'))
		} as never);

		expect(response.status).toBe(200);
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);
		expect(zitadelMocks.refreshAuthSession).toHaveBeenCalledOnce();
		expect(locals.user?.accountId).toBe('user-123');
		expect(locals.meiliSearchKey).toBe('search-key');

		vi.unstubAllGlobals();
	});
});
