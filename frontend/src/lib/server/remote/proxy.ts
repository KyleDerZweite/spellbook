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

function forwardUpload(source: ReadableStream<Uint8Array>) {
	const reader = source.getReader();
	let controller: ReadableStreamDefaultController<Uint8Array>;
	let forwarding = true;
	let failure: { cause: unknown } | undefined;
	function stop(close = true) {
		if (!forwarding) return;
		forwarding = false;
		// Cancelling the SvelteKit body destroys the browser's response socket.
		// Release ownership instead; adapter-node drains unread bytes after sending the response.
		reader.releaseLock();
		if (close) controller.close();
	}
	const stream = new ReadableStream<Uint8Array>(
		{
			start(value) {
				controller = value;
			},
			async pull() {
				try {
					const chunk = await reader.read();
					if (!forwarding) return;
					if (chunk.done) stop();
					else controller.enqueue(chunk.value);
				} catch (cause) {
					if (!forwarding) return;
					failure = { cause };
					stop(false);
					controller.error(cause);
				}
			},
			cancel() {
				stop(false);
			}
		},
		{ highWaterMark: 0 }
	);
	return { stream, stop, failure: () => failure };
}

/** Keep raw API authority selection and stream bodies without inspecting them. */
export async function proxyApi(
	event: Pick<RequestEvent, 'request' | 'url' | 'getClientAddress'>,
	path = event.url.pathname,
	send: typeof fetch = fetch
): Promise<Response> {
	let upload: ReturnType<typeof forwardUpload> | undefined;
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
			upload = forwardUpload(event.request.body);
			init.body = upload.stream;
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
		const failure = upload?.failure();
		if (failure) {
			const cause = failure.cause;
			const limited =
				cause && typeof cause === 'object' && 'status' in cause && cause.status === 413;
			return Response.json(
				{
					status: limited ? 413 : 400,
					message: limited ? 'Request body exceeds the size limit' : 'Unable to read request body'
				},
				{ status: limited ? 413 : 400, headers: { 'cache-control': 'no-store' } }
			);
		}
		return Response.json(
			{ message: 'The API is temporarily unavailable. Try again.' },
			{ status: 503, headers: { 'cache-control': 'no-store' } }
		);
	} finally {
		upload?.stop();
	}
}
