import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireFormOrigin } from '../../src/lib/server/auth/csrf';
import { handle } from '../../src/hooks.server';

const mocks = vi.hoisted(() => ({ validateSession: vi.fn(async () => null) }));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	validateSession: mocks.validateSession
}));

function event(
	path = '/auth/login',
	method = 'POST',
	contentType: string | null = 'application/x-www-form-urlencoded',
	origin?: string
) {
	const url = new URL(path, 'https://spellbook.test');
	const headers = new Headers();
	if (contentType !== null) headers.set('content-type', contentType);
	if (origin !== undefined) headers.set('origin', origin);
	return {
		url,
		request: new Request(url, { method, headers }),
		locals: {},
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
	};
}

beforeEach(() => vi.clearAllMocks());
describe('framework form Origin protection', () => {
	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('guards framework form types for %s', (method) => {
		for (const contentType of [
			'application/x-www-form-urlencoded',
			'Multipart/Form-Data; boundary=review',
			'text/plain',
			'application/x-sveltekit-formdata',
			null
		]) {
			for (const origin of [undefined, 'https://foreign.test', 'null']) {
				expect(() => requireFormOrigin(event('/auth/login', method, contentType, origin))).toThrow(
					expect.objectContaining({ status: 403 })
				);
			}
			expect(() =>
				requireFormOrigin(event('/auth/login', method, contentType, 'https://spellbook.test'))
			).not.toThrow();
		}
	});
	it('runs the browser guard before session reads and form actions', async () => {
		const resolve = vi.fn();
		await expect(handle({ event: event(), resolve } as never)).rejects.toMatchObject({
			status: 403
		});
		expect(resolve).not.toHaveBeenCalled();
		expect(mocks.validateSession).not.toHaveBeenCalled();
	});
	it.each([
		['/api/mobile/v1/mtg/scan/sessions/id/frames', 'multipart/form-data; boundary=review'],
		['/api/auth/logout', null],
		['/api/mobile/v1/mtg/inventory/id', 'application/json']
	])(
		'leaves raw API authority and Origin checks to the backend for %s',
		async (path, contentType) => {
			const request = event(path, 'POST', contentType);
			request.request.headers.set('authorization', 'Bearer invalid');
			request.request.headers.set('cookie', 'spellbook_session=cookie-account');
			const resolve = vi.fn(async () => new Response(null, { status: 401 }));
			const response = await handle({ event: request, resolve } as never);
			expect(response.status).toBe(401);
			expect(resolve).toHaveBeenCalledOnce();
			expect(mocks.validateSession).not.toHaveBeenCalled();
			expect(request.cookies.set).not.toHaveBeenCalled();
			expect(request.request.headers.get('authorization')).toBe('Bearer invalid');
		}
	);
	it('permits safe reads and leaves JSON to the owning action', () => {
		expect(() => requireFormOrigin(event('/', 'GET'))).not.toThrow();
		expect(() => requireFormOrigin(event('/settings', 'POST', 'application/json'))).not.toThrow();
	});
});
