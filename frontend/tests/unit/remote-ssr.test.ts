import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE } from '#lib/server/remote/client.ts';
import type { RemoteClient } from '#lib/server/remote/client.ts';
import { handle } from '../../src/hooks.server';
import { application } from '#lib/server/composition.ts';
import { actions as passwordActions } from '../../src/routes/settings/password/+page.server';

const scope = vi.hoisted(() => ({ event: undefined as unknown }));
vi.mock('$app/server', () => ({ getRequestEvent: () => scope.event }));
const user = { accountId: 'cookie-account', username: 'mage', email: '' };
function event(path = '/mtg/inventory', form?: Record<string, string>) {
	const url = new URL(path, 'https://spellbook.test');
	const values = new Map([[SESSION_COOKIE, 'cookie-session']]);
	const fixture = {
		url,
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			headers: {
				authorization: 'Bearer bearer-account',
				'x-spellbook-client-address': 'spoofed',
				origin: url.origin
			},
			...(form ? { body: new URLSearchParams(form) } : {})
		}),
		locals: {} as { api: RemoteClient; user: typeof user | null },
		cookies: {
			get: (key: string) => values.get(key),
			set: vi.fn((key: string, value: string) => values.set(key, value)),
			delete: vi.fn((key: string) => values.delete(key))
		},
		getClientAddress: () => '192.0.2.25'
	};
	scope.event = fixture;
	return fixture;
}
beforeEach(() => {
	vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:4000');
	vi.stubEnv('APP_ORIGIN', 'https://spellbook.test');
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('request-bound SSR credentials', () => {
	it('selects only the page cookie, overwrites client address and uses the public Origin', async () => {
		const send = vi
			.fn<typeof fetch>()
			.mockResolvedValue(Response.json({ user, expiresAt: 'expiry' }));
		vi.stubGlobal('fetch', send);
		const fixture = event();
		await handle({ event: fixture, resolve: async () => new Response('page') } as never);
		expect(String(send.mock.calls[0][0])).toBe('http://api.internal:4000/api/auth/session');
		const headers = new Headers(send.mock.calls[0][1]?.headers);
		expect(headers.get('cookie')).toBe('spellbook_session=cookie-session');
		expect(headers.has('authorization')).toBe(false);
		expect(headers.get('origin')).toBe('https://spellbook.test');
		expect(headers.get('x-spellbook-client-address')).toBe('192.0.2.25');
		expect(fixture.locals.user).toEqual(user);
	});
	it('does not clear a valid browser cookie or redirect to login when the API is unavailable', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unavailable')));
		const fixture = event();
		await expect(handle({ event: fixture, resolve: vi.fn() } as never)).rejects.toMatchObject({
			status: 503
		});
		expect(fixture.cookies.delete).not.toHaveBeenCalled();
	});
	it('clears an expired cookie only after an actual API 401', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ message: 'expired' }, { status: 401 }))
		);
		const fixture = event();
		const response = await handle({ event: fixture, resolve: vi.fn() } as never);
		expect(response.status).toBe(302);
		expect(fixture.cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE, { path: '/' });
	});
	it('sets the replacement cookie before the native action reload reads with the new token', async () => {
		const send = vi.fn<typeof fetch>().mockImplementation(async (url) => {
			if (String(url).endsWith('/api/auth/session'))
				return Response.json({ user, expiresAt: 'expiry' });
			if (String(url).endsWith('/api/web/v1/password'))
				return Response.json({ success: true, token: 'rotated-session', expiresAt: 'expiry' });
			return Response.json({ user, card: {}, totals: {} });
		});
		vi.stubGlobal('fetch', send);
		const fixture = event('/settings/password', {
			currentPassword: 'current-password',
			newPassword: 'replacement-password',
			confirmPassword: 'replacement-password'
		});
		const resolve = async () => {
			const result = await passwordActions.default!(fixture as never);
			expect(result).toMatchObject({ success: true });
			expect(fixture.cookies.set).toHaveBeenCalledWith(
				SESSION_COOKIE,
				'rotated-session',
				expect.objectContaining({ httpOnly: true, secure: true })
			);
			await application.profile.get(user);
			return new Response('saved and loaded');
		};
		const response = await handle({ event: fixture, resolve } as never);
		expect(response.status).toBe(200);
		expect(new Headers(send.mock.calls[1][1]?.headers).get('cookie')).toBe(
			'spellbook_session=cookie-session'
		);
		expect(new Headers(send.mock.calls[2][1]?.headers).get('cookie')).toBe(
			'spellbook_session=rotated-session'
		);
	});
});
