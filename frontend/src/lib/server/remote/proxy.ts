import type { RequestEvent } from '@sveltejs/kit';
import { remoteConfiguration } from './config.ts';

const hopHeaders = [
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
];
function removeHopHeaders(headers: Headers) {
	for (const name of headers.get('connection')?.split(',') ?? []) headers.delete(name.trim());
	for (const name of hopHeaders) headers.delete(name);
}

/** Keep raw API authority selection and stream bodies without inspecting them. */
export async function proxyApi(
	event: Pick<RequestEvent, 'request' | 'url' | 'getClientAddress'>,
	path = event.url.pathname,
	send: typeof fetch = fetch
): Promise<Response> {
	try {
		const { apiUrl } = remoteConfiguration(event.url);
		const headers = new Headers(event.request.headers);
		removeHopHeaders(headers);
		for (const name of [
			'host',
			'forwarded',
			'x-forwarded-for',
			'x-forwarded-host',
			'x-forwarded-proto',
			'x-spellbook-client-address',
			'content-length'
		])
			headers.delete(name);
		headers.set('X-Spellbook-Client-Address', event.getClientAddress());
		headers.set('accept-encoding', 'identity');
		const init: RequestInit & { duplex?: 'half' } = {
			method: event.request.method,
			headers,
			signal: event.request.signal,
			redirect: 'manual'
		};
		if (event.request.body && !['GET', 'HEAD'].includes(event.request.method)) {
			init.body = event.request.body;
			init.duplex = 'half';
		}
		const upstream = await send(new URL(path + event.url.search, apiUrl), init);
		const responseHeaders = new Headers(upstream.headers);
		removeHopHeaders(responseHeaders);
		responseHeaders.delete('content-encoding');
		responseHeaders.delete('content-length');
		responseHeaders.delete('set-cookie');
		for (const cookie of upstream.headers.getSetCookie())
			responseHeaders.append('set-cookie', cookie);
		return new Response(upstream.body, {
			status: upstream.status,
			statusText: upstream.statusText,
			headers: responseHeaders
		});
	} catch {
		if (event.request.signal.aborted) throw event.request.signal.reason;
		return Response.json(
			{ message: 'The API is temporarily unavailable. Try again.' },
			{ status: 503, headers: { 'cache-control': 'no-store' } }
		);
	}
}
