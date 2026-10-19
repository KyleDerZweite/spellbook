import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { createHttpApplication } from '../../src/http/application.ts';
import { createHttpFixture, publicOrigin, token, user, acknowledgement } from './http-fixture.ts';

const lifetime = await createHttpFixture();
afterAll(() => lifetime.close());
const application = lifetime.application;
const http = createHttpApplication(application, { publicOrigin });
afterAll(() => http.closeStreams());
const validate = vi.spyOn(application.auth, 'validateSession');
const attempt = vi.spyOn(application.auth, 'takeAuthAttempt');
const authenticate = vi.spyOn(application.auth, 'authenticate');
const patch = vi.spyOn(application.inventory, 'patchEntry');
const redeem = vi.spyOn(application.auth.qr, 'redeem');
const expiresAt = '2030-01-01T00:00:00.000Z';

beforeEach(() => {
	vi.clearAllMocks();
	validate.mockImplementation(async (value) => (value === token ? user : null));
	attempt.mockImplementation(() => {});
	authenticate.mockResolvedValue(null);
	patch.mockResolvedValue(acknowledgement);
});
function send(path: string, body?: string, headers: Record<string, string> = {}, method = 'POST') {
	return http.handle(
		new Request(new URL(path, publicOrigin), {
			method,
			headers: { 'content-type': 'application/json', ...headers },
			...(body === undefined ? {} : { body })
		}),
		{ clientAddress: 'sanitized-client' }
	);
}

it('http-web-absence-null-unknown-numbers', async () => {
	const input = {
		requestId: 'sanitized-request',
		entryId: 'sanitized-entry',
		quantity: 2
	};
	const command = (value: unknown) =>
		JSON.stringify({ operation: 'inventory.patchEntry', input: value });
	const headers = { authorization: `Bearer ${token}` };
	const success = await send('/api/web/v1/commands', command(input), headers);
	expect(success.status).toBe(200);
	expect(await success.json()).toEqual(acknowledgement);
	expect(patch).toHaveBeenLastCalledWith(user, { ...input, source: 'web' });
	expect(Object.hasOwn(patch.mock.calls[0][1], 'notes')).toBe(false);
	for (const [extra, message] of [
		[{ notes: null }, 'notes must be a string'],
		[{ actor: user }, 'Unsupported web command input fields'],
		[{ source: 'mobile' }, 'Unsupported web command input fields'],
		[{ quantity: '2' }, 'quantity must be a finite number']
	] as const) {
		const response = await send('/api/web/v1/commands', command({ ...input, ...extra }), headers);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ message, status: 400 });
	}
	const nonfinite = await send(
		'/api/web/v1/commands',
		'{"operation":"inventory.patchEntry","input":{"requestId":"x","entryId":"y","quantity":1e999}}',
		headers
	);
	expect(nonfinite.status).toBe(400);
	expect(await nonfinite.json()).toEqual({
		status: 400,
		message: 'quantity must be a finite number'
	});
	expect(patch).toHaveBeenCalledTimes(1);
});

it('http-raw-form-attempt-order-and-first-value', async () => {
	const order: string[] = [];
	attempt.mockImplementation(() => {
		order.push('attempt');
	});
	authenticate.mockImplementation(async () => {
		order.push('authenticate');
		return null;
	});
	const response = await send(
		'/api/web/v1/auth/login',
		'username=First&username=second&password=a+b%2Bc',
		{
			origin: publicOrigin,
			'content-type': 'application/x-www-form-urlencoded'
		}
	);
	expect(order).toEqual(['attempt', 'authenticate']);
	expect(authenticate).toHaveBeenCalledWith('login', 'First', 'a b+c', {});
	expect(response.status).toBe(400);
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
	expect(await response.json()).toEqual({
		message: 'Invalid username or password.',
		username: 'First'
	});
	order.length = 0;
	const malformed = await send('/api/web/v1/auth/login', 'broken', {
		origin: publicOrigin,
		'content-type': 'multipart/form-data'
	});
	expect(malformed.status).toBe(400);
	expect(order).toEqual(['attempt']);
	expect(attempt).toHaveBeenCalledTimes(2);
});

it('http-origin-and-explicit-authorization', async () => {
	const cookie = `spellbook_session=${token}`;
	const path = '/api/web/v1/commands';
	const body =
		'{"operation":"inventory.patchEntry","input":{"requestId":"x","entryId":"y","quantity":2}}';
	for (const origin of [undefined, 'null', 'https://foreign.test']) {
		const response = await send(path, body, {
			cookie,
			...(origin === undefined ? {} : { origin })
		});
		expect(response.status).toBe(403);
	}
	expect((await send(path, body, { cookie, origin: publicOrigin })).status).toBe(200);
	const explicit = await send(
		'/api/account/profile',
		undefined,
		{ cookie, authorization: 'Basic invalid' },
		'GET'
	);
	expect(explicit.status).toBe(401);
	expect(await explicit.json()).toEqual({
		status: 401,
		message: 'Invalid bearer token'
	});
	const foreignForm = await send('/api/web/v1/auth/login', 'username=x', {
		origin: 'https://foreign.test',
		'content-type': 'application/x-www-form-urlencoded'
	});
	expect(foreignForm.status).toBe(403);
	expect(attempt).not.toHaveBeenCalled();
});

it('http-ordered-set-cookie-cleanup-replacement', async () => {
	const code = 'c'.repeat(43),
		secret = 's'.repeat(43),
		replacement = 'r'.repeat(43);
	redeem.mockResolvedValue({
		kind: 'browser',
		status: 'authenticated',
		session: { token: replacement, expiresAt }
	});
	const response = await send('/api/auth/qr/token', JSON.stringify({ code }), {
		origin: publicOrigin,
		cookie: `spellbook_session=stale; spellbook_qr_requester=${code}.${secret}`
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: 'authenticated', expiresAt });
	expect(response.headers.getSetCookie()).toEqual([
		'spellbook_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
		`spellbook_session=${replacement}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`,
		'spellbook_qr_requester=; Path=/api/auth/qr; Max-Age=0; HttpOnly; SameSite=Lax; Secure'
	]);
});
