import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthRoutes } from '../../src/http/routes/auth.ts';
import { createRouter } from '../../src/http/router.ts';
import { QR_REQUESTER_COOKIE } from '../../src/http/cookies.ts';
import { QrAuthError } from '../../src/auth/qr.ts';
import { createHttpFixture, publicOrigin as origin, user } from './http-fixture.ts';

const lifetime = await createHttpFixture();
afterAll(() => lifetime.close());
const application = lifetime.application;
const auth = {
	validateSession: vi.spyOn(application.auth, 'validateSession'),
	qr: {
		create: vi.spyOn(application.auth.qr, 'create'),
		inspect: vi.spyOn(application.auth.qr, 'inspect'),
		decide: vi.spyOn(application.auth.qr, 'decide'),
		redeem: vi.spyOn(application.auth.qr, 'redeem')
	}
};
const dependencies = { application, publicOrigin: origin };
const handle = createRouter(createAuthRoutes(dependencies), dependencies);
const code = 'c'.repeat(43);
const secret = 's'.repeat(43);
const token = 't'.repeat(43);
const expiresAt = '2030-01-01T00:00:00.000Z';
function send(
	operation: 'create' | 'inspect' | 'decide' | 'token',
	body?: unknown,
	headers: Record<string, string> = { origin },
	cookies: Record<string, string> = {}
) {
	const path = {
		create: '/api/auth/qr/requests',
		inspect: `/api/auth/qr/requests/${code}`,
		decide: `/api/auth/qr/requests/${code}/decision`,
		token: '/api/auth/qr/token'
	}[operation];
	return handle(
		new Request(new URL(path, origin), {
			method: operation === 'inspect' ? 'GET' : 'POST',
			headers: {
				'content-type': 'application/json',
				...(Object.keys(cookies).length
					? {
							cookie: Object.entries(cookies)
								.map(([name, value]) => `${name}=${value}`)
								.join('; ')
						}
					: {}),
				...headers
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) })
		}),
		{ clientAddress: 'adapter-client' }
	);
}

describe('QR HTTP adapter', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		auth.validateSession.mockResolvedValue(null);
		auth.qr.create.mockImplementation(async (kind) => ({
			code,
			kind,
			requesterSecret: secret,
			expiresAt,
			interval: 3
		}));
		auth.qr.redeem.mockResolvedValue({
			kind: 'browser',
			status: 'authenticated',
			session: { token, expiresAt }
		});
		auth.qr.inspect.mockResolvedValue({ code, kind: 'browser', status: 'pending', expiresAt });
	});
	it('creates a browser request with a code-bound secure HttpOnly cookie and no JSON secret', async () => {
		const response = await send('create', { kind: 'browser' });
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			code,
			kind: 'browser',
			expiresAt,
			interval: 3,
			verificationUri: `${origin}/auth/approve?code=${code}`
		});
		expect(response.headers.getSetCookie()).toEqual([
			`${QR_REQUESTER_COOKIE}=${code}.${secret}; Path=/api/auth/qr; Max-Age=300; HttpOnly; SameSite=Lax; Secure`
		]);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('returns a native private secret without creating a requester cookie', async () => {
		const response = await send('create', { kind: 'device' }, {});
		expect((await response.json()).requesterSecret).toBe(secret);
		expect(response.headers.getSetCookie()).toEqual([]);
	});
	it('uses the stored browser kind to set the ordinary session cookie and omit its token from JSON', async () => {
		const response = await send(
			'token',
			{ code },
			{ origin },
			{ [QR_REQUESTER_COOKIE]: `${code}.${secret}` }
		);
		expect(await response.json()).toEqual({ status: 'authenticated', expiresAt });
		expect(auth.qr.redeem).toHaveBeenCalledWith(
			code,
			{ requesterSecret: undefined, browserSecret: secret, browserAuthenticated: false },
			'adapter-client'
		);
		expect(response.headers.getSetCookie()).toEqual([
			`spellbook_session=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`,
			`${QR_REQUESTER_COOKIE}=; Path=/api/auth/qr; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
		]);
	});
	it('uses the stored device kind to return a bearer without overwriting an existing browser session', async () => {
		auth.qr.redeem.mockResolvedValue({
			kind: 'device',
			status: 'authenticated',
			session: { token, expiresAt }
		});
		auth.validateSession.mockResolvedValue(user);
		const response = await send(
			'token',
			{ code, requesterSecret: secret },
			{},
			{ spellbook_session: token }
		);
		expect(await response.json()).toEqual({ status: 'authenticated', expiresAt, token });
		expect(response.headers.getSetCookie()).toEqual([]);
	});
	it('never forwards a browser cookie bound to another code', async () => {
		auth.qr.redeem.mockRejectedValue(new QrAuthError('Unauthenticated', 'Authentication required'));
		const response = await send(
			'token',
			{ code },
			{ origin },
			{ [QR_REQUESTER_COOKIE]: `${'x'.repeat(43)}.${secret}` }
		);
		expect(response.status).toBe(401);
		expect(auth.qr.redeem).toHaveBeenCalledWith(
			code,
			expect.objectContaining({ browserSecret: undefined }),
			'adapter-client'
		);
		expect(response.headers.getSetCookie()).toEqual([]);
	});
	it('checks the target browser cookie independently of an invalid Authorization header', async () => {
		auth.validateSession.mockResolvedValue(user);
		expect(
			(
				await send(
					'create',
					{ kind: 'browser' },
					{ origin, authorization: 'Bearer invalid' },
					{ spellbook_session: token }
				)
			).status
		).toBe(409);
		expect(auth.validateSession).toHaveBeenCalledWith(token);
		expect(auth.qr.create).not.toHaveBeenCalled();
	});
	it('rejects every supplied foreign/null/empty Origin and requires Origin for browser cookie mutation', async () => {
		for (const supplied of ['https://foreign.test', 'null', '']) {
			const response = await send('create', { kind: 'device' }, { origin: supplied });
			expect(response.status).toBe(403);
			expect(response.headers.get('cache-control')).toBe('no-store');
		}
		expect((await send('create', { kind: 'browser' }, {})).status).toBe(403);
		expect(
			(await send('token', { code }, {}, { [QR_REQUESTER_COOKIE]: `${code}.${secret}` })).status
		).toBe(403);
		expect(auth.qr.create).not.toHaveBeenCalled();
		expect(auth.qr.redeem).not.toHaveBeenCalled();
	});
	it('keeps Authorization-before-cookie and same-origin cookie decisions', async () => {
		auth.validateSession.mockImplementation(async (supplied) => (supplied === token ? user : null));
		expect(
			(
				await send(
					'inspect',
					undefined,
					{ authorization: 'Bearer invalid' },
					{ spellbook_session: token }
				)
			).status
		).toBe(401);
		expect(auth.qr.inspect).not.toHaveBeenCalled();
		auth.validateSession.mockResolvedValue(user);
		expect((await send('inspect', undefined, { authorization: `Bearer ${token}` })).status).toBe(
			200
		);
		expect(
			(await send('decide', { decision: 'approve' }, {}, { spellbook_session: token })).status
		).toBe(403);
		expect(auth.qr.decide).not.toHaveBeenCalled();
	});
	it('bounds JSON sizes, types and unknown fields before backend creation', async () => {
		for (const body of [{ kind: null }, { kind: 'device', accountId: 'selected' }, []])
			expect((await send('create', body)).status).toBe(400);
		expect((await send('create', { kind: 'x'.repeat(1100) })).status).toBe(413);
		expect(auth.qr.create).not.toHaveBeenCalled();
	});
	it('returns terminal statuses without tokens and clears only browser terminal cookies', async () => {
		for (const status of ['denied', 'expired', 'consumed'] as const) {
			auth.qr.redeem.mockResolvedValue({ kind: 'browser', status });
			const response = await send(
				'token',
				{ code },
				{ origin },
				{ [QR_REQUESTER_COOKIE]: `${code}.${secret}` }
			);
			expect(await response.json()).toEqual({ status });
			expect(response.headers.getSetCookie()).toEqual([
				`${QR_REQUESTER_COOKIE}=; Path=/api/auth/qr; Max-Age=0; HttpOnly; SameSite=Lax; Secure`
			]);
		}
	});
});
