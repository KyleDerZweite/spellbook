import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	hashPassword,
	normalizeUsername,
	validPassword,
	verifyPassword
} from '../../src/lib/server/auth/password';
import {
	requireSameOrigin,
	sanitizeReturnTo,
	takeAuthAttempt
} from '../../src/lib/server/auth/local';
import {
	getBearerToken,
	hashSessionToken,
	SESSION_COOKIE,
	writeSessionCookie
} from '../../src/lib/server/auth/session';
import { NO_INDEX_ROBOTS_TAG } from '../../src/lib/seo/site';

const mocks = vi.hoisted(() => ({ validateSession: vi.fn() }));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	validateSession: mocks.validateSession
}));
import { handle } from '../../src/hooks.server';

function cookies() {
	const values = new Map<string, string>();
	return {
		get: (key: string) => values.get(key),
		set: vi.fn((key: string, value: string) => values.set(key, value)),
		delete: vi.fn((key: string) => values.delete(key))
	};
}

describe('local auth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateSession.mockResolvedValue(null);
	});
	it('normalizes usernames and bounds credentials', () => {
		expect(normalizeUsername('  Mage_42  ')).toBe('mage_42');
		for (const name of ['ab', '_mage', 'a'.repeat(33), 'a b', 'mége', null])
			expect(normalizeUsername(name)).toBeNull();
		expect(validPassword('x'.repeat(12))).toBe(true);
		expect(validPassword('x'.repeat(128))).toBe(true);
		for (const password of ['x'.repeat(11), 'x'.repeat(129), null])
			expect(validPassword(password)).toBe(false);
	});
	it('salts password hashes and rejects wrong passwords and missing accounts', async () => {
		const password = 'correct horse battery';
		const first = await hashPassword(password);
		const second = await hashPassword(password);
		expect(first).not.toBe(second);
		expect(first).not.toContain(password);
		expect(await verifyPassword(password, first)).toBe(true);
		expect(await verifyPassword('wrong horse battery', first)).toBe(false);
		expect(await verifyPassword(password, null)).toBe(false);
	});
	it('rejects external and backslash return destinations', () => {
		for (const value of [
			'//evil.test',
			'/\t/evil.test',
			'/\\evil.test',
			'https://evil.test',
			'/\nlocation',
			null
		])
			expect(sanitizeReturnTo(value)).toBe('/');
		expect(sanitizeReturnTo('/decks?q=test')).toBe('/decks?q=test');
	});
	it('requires the same origin on browser mutations', () => {
		const url = new URL('https://spellbook.test/auth/login');
		for (const origin of [undefined, 'https://evil.test', 'null']) {
			const event = { url, request: new Request(url, { headers: origin ? { origin } : {} }) };
			expect(() => requireSameOrigin(event)).toThrow();
		}
		expect(() =>
			requireSameOrigin({ url, request: new Request(url, { headers: { origin: url.origin } }) })
		).not.toThrow();
		expect(() => requireSameOrigin({ url, request: new Request(url) }, true)).not.toThrow();
	});
	it('bounds auth attempts and resets the window', () => {
		const address = crypto.randomUUID();
		for (let i = 0; i < 20; i++) takeAuthAttempt(address, 100);
		expect(() => takeAuthAttempt(address, 100)).toThrow();
		expect(() => takeAuthAttempt(address, 100 + 15 * 60 * 1000)).not.toThrow();
	});
	it('writes an HttpOnly cookie and only accepts exact bearer syntax', () => {
		const jar = cookies();
		writeSessionCookie(jar as never, 'token', new URL('https://spellbook.test'));
		expect(jar.set).toHaveBeenCalledWith(
			SESSION_COOKIE,
			'token',
			expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
		);
		const token = 'a'.repeat(43);
		expect(
			getBearerToken(
				new Request('https://spellbook.test', { headers: { authorization: `Bearer ${token}` } })
			)
		).toBe(token);
		expect(
			getBearerToken(
				new Request('https://spellbook.test', {
					headers: { authorization: `Bearer ${token} extra` }
				})
			)
		).toBeUndefined();
		expect(hashSessionToken(token)).toHaveLength(64);
	});
	it('redirects protected routes and clears invalid sessions', async () => {
		const jar = cookies();
		jar.set(SESSION_COOKIE, 'expired');
		const response = await handle({
			event: {
				url: new URL('https://spellbook.test/search?q=bolt'),
				cookies: jar,
				locals: {},
				request: new Request('https://spellbook.test/search?q=bolt')
			},
			resolve: vi.fn()
		} as never);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/auth/login?returnTo=%2Fsearch%3Fq%3Dbolt');
		expect(response.headers.get('x-robots-tag')).toBe(NO_INDEX_ROBOTS_TAG);
		expect(jar.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
	});
});
