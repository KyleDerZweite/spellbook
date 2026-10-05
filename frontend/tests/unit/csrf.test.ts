import { describe, expect, it, vi } from 'vitest';
import { requireFormOrigin } from '../../src/lib/server/auth/csrf';
import { handle } from '../../src/hooks.server';
import { POST as uploadFrame } from '../../src/routes/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames/+server';

const mocks = vi.hoisted(() => ({ validateSession: vi.fn(async () => null) }));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	validateSession: mocks.validateSession
}));

const scanRoute = '/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames';
const scanPath = '/api/mobile/v1/mtg/scan/sessions/11111111-1111-1111-1111-111111111111/frames';
const token = 'a'.repeat(43);
function event({
	method = 'POST',
	contentType = 'multipart/form-data; boundary=review',
	origin,
	bearer,
	route = scanRoute
}: {
	method?: string;
	contentType?: string | null;
	origin?: string;
	bearer?: string;
	route?: Parameters<typeof requireFormOrigin>[0]['route']['id'];
} = {}) {
	const url = new URL('https://spellbook.test' + scanPath);
	const headers = new Headers();
	if (contentType !== null) headers.set('content-type', contentType);
	if (origin !== undefined) headers.set('origin', origin);
	if (bearer !== undefined) headers.set('authorization', bearer);
	return {
		url,
		request: new Request(url, { method, headers }),
		route: { id: route },
		params: { sessionId: '11111111-1111-1111-1111-111111111111' },
		locals: { user: null },
		cookies: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
	};
}

describe('central form origin protection', () => {
	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
		'guards all framework form media types for %s',
		(method) => {
			for (const contentType of [
				'application/x-www-form-urlencoded',
				'Multipart/Form-Data; boundary=review',
				'text/plain',
				'application/x-sveltekit-formdata',
				null
			]) {
				for (const origin of [undefined, 'https://foreign.test', 'null']) {
					expect(() =>
						requireFormOrigin(event({ method, contentType, origin, route: '/auth/login' }))
					).toThrow(expect.objectContaining({ status: 403 }));
				}
				expect(() =>
					requireFormOrigin(event({ method, contentType, origin: 'https://spellbook.test' }))
				).not.toThrow();
			}
		}
	);

	it('allows only originless POST multipart uploads with bearer syntax on the exact scan route', () => {
		expect(() => requireFormOrigin(event({ bearer: `Bearer ${token}` }))).not.toThrow();
		for (const options of [
			{ origin: 'https://foreign.test' },
			{ origin: 'null' },
			{ method: 'PUT' },
			{ contentType: 'text/plain' },
			{ route: '/auth/login' },
			{ route: '/mtg/inventory' },
			{ route: null },
			{ bearer: 'Bearer invalid' },
			{ bearer: undefined }
		] as const)
			expect(() => requireFormOrigin(event({ bearer: `Bearer ${token}`, ...options }))).toThrow(
				expect.objectContaining({ status: 403 })
			);
	});

	it('preserves only exact bodyless native bearer logout and deletion routes', () => {
		for (const [method, route] of [
			['DELETE', '/api/mobile/v1/mtg/decks/[deckId]'],
			['DELETE', '/api/mobile/v1/mtg/deck-cards/[entryId]'],
			['DELETE', '/api/mobile/v1/mtg/inventory/[entryId]'],
			['POST', '/api/mobile/v1/mtg/scan/sessions'],
			['POST', '/api/auth/logout']
		] as const) {
			const options = { method, route, contentType: null, bearer: `Bearer ${token}` };
			expect(() => requireFormOrigin(event(options))).not.toThrow();
			for (const origin of ['https://foreign.test', 'null']) {
				expect(() => requireFormOrigin(event({ ...options, origin }))).toThrow(
					expect.objectContaining({ status: 403 })
				);
			}
			expect(() => requireFormOrigin(event({ ...options, bearer: undefined }))).toThrow(
				expect.objectContaining({ status: 403 })
			);
			const withBody = event(options);
			withBody.request = new Request(withBody.url, {
				method,
				headers: { authorization: `Bearer ${token}` },
				body: new Uint8Array([1])
			});
			expect(() => requireFormOrigin(withBody)).toThrow(expect.objectContaining({ status: 403 }));
		}
		for (const route of [
			'/auth/logout',
			'/mtg/inventory',
			'/api/mobile/v1/mtg/decks',
			null
		] as const) {
			expect(() =>
				requireFormOrigin(
					event({ method: 'DELETE', route, contentType: null, bearer: `Bearer ${token}` })
				)
			).toThrow(expect.objectContaining({ status: 403 }));
		}
	});

	it('runs the guard before resolving routes or validating cookie sessions', async () => {
		mocks.validateSession.mockClear();
		const resolve = vi.fn();
		await expect(
			handle({ event: event({ route: '/auth/login' }), resolve } as never)
		).rejects.toMatchObject({ status: 403 });
		expect(resolve).not.toHaveBeenCalled();
		expect(mocks.validateSession).not.toHaveBeenCalled();
	});

	it('lets native scan uploads reach route authentication', async () => {
		const resolve = vi.fn(async () => new Response(null, { status: 204 }));
		const response = await handle({
			event: event({ bearer: `Bearer ${token}` }),
			resolve
		} as never);
		expect(response.status).toBe(204);
		expect(resolve).toHaveBeenCalledOnce();
	});

	it('rejects an invalid bearer at the upload route even when cookie authentication exists', async () => {
		const request = event({ bearer: `Bearer ${token}` });
		const authenticatedEvent = {
			...request,
			locals: { user: { accountId: 'cookie-account', username: 'mage', email: '' } }
		};
		requireFormOrigin(authenticatedEvent);
		await expect(uploadFrame(authenticatedEvent as never)).rejects.toMatchObject({ status: 401 });
	});

	it('leaves safe requests and JSON API requests to their existing route guards', () => {
		expect(() => requireFormOrigin(event({ method: 'GET' }))).not.toThrow();
		expect(() => requireFormOrigin(event({ contentType: 'application/json' }))).not.toThrow();
	});
});
