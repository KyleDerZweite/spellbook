import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
	validateSession: vi.fn(),
	qr: { create: vi.fn(), inspect: vi.fn(), decide: vi.fn(), redeem: vi.fn() }
}));
vi.mock('#lib/server/composition.ts', () => ({ application: { auth } }));
import { QR_REQUESTER_COOKIE, qrResponse } from '../../src/lib/server/auth/qr.ts';

const code = 'c'.repeat(43);
const secret = 's'.repeat(43);
const token = 't'.repeat(43);
const expiresAt = '2030-01-01T00:00:00.000Z';
const user = { accountId: 'adapter-account', username: 'mage', email: '' };
const origin = 'https://spellbook.test';
function event(
	body?: unknown,
	headers: Record<string, string> = { origin },
	cookieValues: Record<string, string> = {},
	cookieUser: typeof user | null = null
) {
	const values = new Map(Object.entries(cookieValues));
	const url = new URL('/api/auth/qr/token', origin);
	return {
		url,
		params: { code },
		request: new Request(url, {
			method: body === undefined ? 'GET' : 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		locals: { user: cookieUser, mobileBearerUser: null },
		getClientAddress: () => 'adapter-client',
		setHeaders: vi.fn(),
		cookies: {
			get: (name: string) => values.get(name),
			set: vi.fn(),
			delete: vi.fn()
		}
	};
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
		const input = event({ kind: 'browser' });
		const response = await qrResponse(input as never, 'create');
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			code,
			kind: 'browser',
			expiresAt,
			interval: 3,
			verificationUri: `${origin}/auth/approve?code=${code}`
		});
		expect(input.cookies.set).toHaveBeenCalledWith(QR_REQUESTER_COOKIE, `${code}.${secret}`, {
			path: '/api/auth/qr',
			httpOnly: true,
			sameSite: 'lax',
			secure: true,
			maxAge: 300
		});
		expect(input.setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'no-store' });
	});
	it('returns a native private secret without creating a requester cookie', async () => {
		const input = event({ kind: 'device' }, {});
		const response = await qrResponse(input as never, 'create');
		expect((await response.json()).requesterSecret).toBe(secret);
		expect(input.cookies.set).not.toHaveBeenCalled();
	});
	it('uses the stored browser kind to set the ordinary session cookie and omit its token from JSON', async () => {
		const input = event({ code }, { origin }, { [QR_REQUESTER_COOKIE]: `${code}.${secret}` });
		const response = await qrResponse(input as never, 'token');
		expect(await response.json()).toEqual({ status: 'authenticated', expiresAt });
		expect(auth.qr.redeem).toHaveBeenCalledWith(
			code,
			{ requesterSecret: undefined, browserSecret: secret, browserAuthenticated: false },
			'adapter-client'
		);
		expect(input.cookies.set).toHaveBeenCalledWith(
			'spellbook_session',
			token,
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' })
		);
		expect(input.cookies.delete).toHaveBeenCalledWith(QR_REQUESTER_COOKIE, {
			path: '/api/auth/qr'
		});
	});
	it('uses the stored device kind to return a bearer without overwriting an existing browser session', async () => {
		auth.qr.redeem.mockResolvedValue({
			kind: 'device',
			status: 'authenticated',
			session: { token, expiresAt }
		});
		auth.validateSession.mockResolvedValue(user);
		const input = event({ code, requesterSecret: secret }, {}, { spellbook_session: token });
		expect(await (await qrResponse(input as never, 'token')).json()).toEqual({
			status: 'authenticated',
			expiresAt,
			token
		});
		expect(input.cookies.set).not.toHaveBeenCalled();
		expect(input.cookies.delete).not.toHaveBeenCalled();
	});
	it('never forwards a browser cookie bound to another code', async () => {
		auth.qr.redeem.mockRejectedValue({ kind: 'Unauthenticated' });
		const input = event(
			{ code },
			{ origin },
			{ [QR_REQUESTER_COOKIE]: `${'x'.repeat(43)}.${secret}` }
		);
		expect((await qrResponse(input as never, 'token')).status).toBe(401);
		expect(auth.qr.redeem).toHaveBeenCalledWith(
			code,
			expect.objectContaining({ browserSecret: undefined }),
			'adapter-client'
		);
		expect(input.cookies.set).not.toHaveBeenCalled();
	});
	it('checks the target browser cookie independently of an invalid Authorization header', async () => {
		auth.validateSession.mockResolvedValue(user);
		const input = event(
			{ kind: 'browser' },
			{ origin, authorization: 'Bearer invalid' },
			{ spellbook_session: token }
		);
		await expect(qrResponse(input as never, 'create')).rejects.toMatchObject({ status: 409 });
		expect(auth.validateSession).toHaveBeenCalledWith(token);
		expect(auth.qr.create).not.toHaveBeenCalled();
	});
	it('rejects every supplied foreign/null/empty Origin and requires Origin for browser cookie mutation', async () => {
		for (const supplied of ['https://foreign.test', 'null', '']) {
			const input = event({ kind: 'device' }, { origin: supplied });
			await expect(qrResponse(input as never, 'create')).rejects.toMatchObject({ status: 403 });
			expect(input.setHeaders).toHaveBeenCalledWith({ 'Cache-Control': 'no-store' });
		}
		await expect(
			qrResponse(event({ kind: 'browser' }, {}) as never, 'create')
		).rejects.toMatchObject({ status: 403 });
		await expect(
			qrResponse(
				event({ code }, {}, { [QR_REQUESTER_COOKIE]: `${code}.${secret}` }) as never,
				'token'
			)
		).rejects.toMatchObject({ status: 403 });
		expect(auth.qr.create).not.toHaveBeenCalled();
		expect(auth.qr.redeem).not.toHaveBeenCalled();
	});
	it('keeps Authorization-before-cookie and same-origin cookie decisions', async () => {
		await expect(
			qrResponse(
				event(undefined, { authorization: 'Bearer invalid' }, {}, user) as never,
				'inspect'
			)
		).rejects.toMatchObject({ status: 401 });
		expect(auth.qr.inspect).not.toHaveBeenCalled();
		auth.validateSession.mockResolvedValue(user);
		expect(
			(await qrResponse(event(undefined, { authorization: `Bearer ${token}` }) as never, 'inspect'))
				.status
		).toBe(200);
		await expect(
			qrResponse(event({ decision: 'approve' }, {}, {}, user) as never, 'decide')
		).rejects.toMatchObject({ status: 403 });
		expect(auth.qr.decide).not.toHaveBeenCalled();
	});
	it('bounds JSON sizes, types and unknown fields before backend creation', async () => {
		for (const body of [{ kind: null }, { kind: 'device', accountId: 'selected' }, []])
			await expect(qrResponse(event(body) as never, 'create')).rejects.toMatchObject({
				status: 400
			});
		await expect(
			qrResponse(event({ kind: 'x'.repeat(1100) }) as never, 'create')
		).rejects.toMatchObject({ status: 413 });
		expect(auth.qr.create).not.toHaveBeenCalled();
	});
	it('returns terminal statuses without tokens and clears only browser terminal cookies', async () => {
		for (const status of ['denied', 'expired', 'consumed']) {
			auth.qr.redeem.mockResolvedValue({ kind: 'browser', status });
			const input = event({ code }, { origin }, { [QR_REQUESTER_COOKIE]: `${code}.${secret}` });
			expect(await (await qrResponse(input as never, 'token')).json()).toEqual({ status });
			expect(input.cookies.set).not.toHaveBeenCalled();
			expect(input.cookies.delete).toHaveBeenCalledOnce();
		}
	});
});
