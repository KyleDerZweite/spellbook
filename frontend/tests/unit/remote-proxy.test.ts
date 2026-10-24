import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyApi } from '#lib/server/remote/proxy.ts';

beforeEach(() => vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000'));
afterEach(() => vi.unstubAllEnvs());
function event(path: string, init: RequestInit = {}) {
	const url = new URL(path, 'https://spellbook.test');
	return { url, request: new Request(url, init), getClientAddress: () => '192.0.2.10' };
}

describe('same-origin streaming API proxy', () => {
	it.each([undefined, 'gzip'])(
		'preserves identity image length and drops encoded length: %s',
		async (encoding) => {
			const headers = new Headers({
				'content-type': 'image/png',
				'content-length': '8',
				'cache-control': 'no-store'
			});
			if (encoding) headers.set('content-encoding', encoding);
			const send = vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response(new Uint8Array(8), { headers }));
			const response = await proxyApi(event('/api/v1/mtg/scan/artifacts/image'), undefined, send);
			expect(response.headers.get('content-length')).toBe(encoding ? null : '8');
			expect(response.headers.has('content-encoding')).toBe(false);
			expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(8);
		}
	);
	it.each(['/api/v1/auth/qr/token', '/api/auth/qr/token'])(
		'preserves raw bearer/cookie/Origin and client address for %s',
		async (path) => {
			const request = event(path + '?code=one', {
				method: 'POST',
				headers: {
					authorization: 'Bearer invalid',
					cookie: 'spellbook_session=cookie-token; spellbook_qr_requester=secret',
					origin: 'https://foreign.test',
					forwarded: 'for=evil',
					'x-forwarded-for': 'evil',
					'x-spellbook-client-address': 'evil',
					'content-type': 'application/json'
				},
				body: '{"code":"one"}'
			});
			const send = vi
				.fn<typeof fetch>()
				.mockResolvedValue(Response.json({ message: 'Invalid bearer token' }, { status: 401 }));
			const response = await proxyApi(request, undefined, send);
			const [url, init] = send.mock.calls[0];
			const headers = new Headers(init?.headers);
			expect(String(url)).toBe('http://127.0.0.1:4000' + path + '?code=one');
			expect(headers.get('authorization')).toBe('Bearer invalid');
			expect(headers.get('cookie')).toBe(
				'spellbook_session=cookie-token; spellbook_qr_requester=secret'
			);
			expect(headers.get('origin')).toBe('https://foreign.test');
			expect(headers.get('x-spellbook-client-address')).toBe('192.0.2.10');
			expect(headers.has('forwarded')).toBe(false);
			expect(headers.has('x-forwarded-for')).toBe(false);
			expect(init?.body).toBeInstanceOf(ReadableStream);
			expect(request.request.body?.locked).toBe(false);
			expect(init?.signal).toBe(request.request.signal);
			expect(response.status).toBe(401);
		}
	);
	it('does not cancel the browser body when the upstream stops an upload early', async () => {
		const cancelled = vi.fn();
		let reading!: () => void;
		const started = new Promise<void>((resolve) => {
			reading = resolve;
		});
		const body = new ReadableStream<Uint8Array>(
			{ pull: reading, cancel: cancelled },
			{ highWaterMark: 0 }
		);
		const request = event('/api/v1/mtg/commands', {
			method: 'POST',
			body,
			duplex: 'half'
		} as RequestInit);
		const send = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
			const reader = (init!.body as ReadableStream<Uint8Array>).getReader();
			const pending = reader.read();
			await started;
			await reader.cancel();
			await pending;
			return Response.json({ message: 'Request body exceeds the size limit' }, { status: 413 });
		});
		const response = await proxyApi(request, undefined, send);
		expect(response.status).toBe(413);
		expect(cancelled).not.toHaveBeenCalled();
		expect(body.locked).toBe(false);
	});
	it.each([413, undefined])(
		'preserves a source body failure independently of fetch rejection: %s',
		async (status) => {
			const cause = Object.assign(new Error('internal adapter details'), { status });
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.error(cause);
				}
			});
			const request = event('/api/v1/mtg/commands', {
				method: 'POST',
				body,
				duplex: 'half'
			} as RequestInit);
			const send = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
				await expect((init!.body as ReadableStream<Uint8Array>).getReader().read()).rejects.toBe(
					cause
				);
				throw new TypeError('fetch failed');
			});
			const response = await proxyApi(request, undefined, send);
			expect(response.status).toBe(status === 413 ? 413 : 400);
			expect(await response.json()).toEqual({
				status: status === 413 ? 413 : 400,
				message:
					status === 413 ? 'Request body exceeds the size limit' : 'Unable to read request body'
			});
			expect(body.locked).toBe(false);
		}
	);
	it('preserves separate Set-Cookie values and body/cache/status without decoding', async () => {
		const headers = new Headers({
			'cache-control': 'no-store',
			'content-type': 'application/json'
		});
		headers.append('set-cookie', 'spellbook_session=token; Path=/; HttpOnly; SameSite=Lax');
		headers.append(
			'set-cookie',
			'spellbook_qr_requester=; Path=/api/v1/auth/qr; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly'
		);
		const upstream = new Response('{"status":"authenticated"}', { status: 201, headers });
		const body = upstream.body;
		const send = vi.fn<typeof fetch>().mockResolvedValue(upstream);
		const response = await proxyApi(event('/api/v1/auth/qr/token'), undefined, send);
		expect(response.body).toBe(body);
		expect(response.status).toBe(201);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
		expect(response.headers.getSetCookie()).toHaveLength(2);
	});
	it('returns an open SSE stream before completion and propagates cancellation', async () => {
		let streamController!: ReadableStreamDefaultController<Uint8Array>;
		const cancelled = vi.fn();
		const upstream = new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					streamController = controller;
				},
				cancel: cancelled
			}),
			{
				headers: {
					'content-type': 'text/event-stream',
					'cache-control': 'no-store',
					'x-accel-buffering': 'no'
				}
			}
		);
		const abort = new AbortController();
		const request = event('/api/v1/account/events', { signal: abort.signal });
		const send = vi.fn<typeof fetch>().mockResolvedValue(upstream);
		const response = await proxyApi(request, undefined, send);
		expect(response.body).toBe(upstream.body);
		expect(response.headers.get('x-accel-buffering')).toBe('no');
		const reader = response.body!.getReader();
		streamController.enqueue(new TextEncoder().encode('event: reset\ndata: {}\n\n'));
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: reset');
		abort.abort();
		expect(send.mock.calls[0][1]?.signal?.aborted).toBe(true);
		await reader.cancel();
		expect(cancelled).toHaveBeenCalledOnce();
	});
	it('keeps native Origin omission and proxies the API schema path', async () => {
		const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ openapi: '3.1.0' }));
		await proxyApi(event('/openapi.json'), '/openapi.json', send);
		expect(String(send.mock.calls[0][0])).toBe('http://127.0.0.1:4000/openapi.json');
		expect(new Headers(send.mock.calls[0][1]?.headers).has('origin')).toBe(false);
	});
	it('returns safe unavailable errors without leaking connection details', async () => {
		const send = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error('private internal URL and password'));
		const response = await proxyApi(event('/api/v1/mtg/catalog/search'), undefined, send);
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({
			message: 'The API is temporarily unavailable. Try again.'
		});
	});
});
