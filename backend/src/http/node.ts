import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { error, errorResponse, HttpError } from './errors.ts';
import type { HttpApplication } from './types.ts';

export interface NodeHttpConfiguration {
	publicOrigin: string;
	/** Explicit socket-peer IPs. No forwarded header is trusted by default. */
	trustedProxyAddresses?: readonly string[];
	maxBodyBytes?: number;
}

function normalizedAddress(address: string): string {
	return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

export function parseTrustedProxyAddresses(value = ''): string[] {
	return value
		.split(',')
		.map((address) => address.trim())
		.filter(Boolean)
		.map((address) => {
			if (!isIP(address))
				throw new Error('API_TRUSTED_PROXY_ADDRESSES accepts comma-separated IP addresses only');
			return normalizedAddress(address);
		});
}

export function clientAddress(incoming: IncomingMessage, trusted: ReadonlySet<string>): string {
	const peer = normalizedAddress(incoming.socket.remoteAddress ?? 'unknown');
	const forwarded = incoming.headers['x-spellbook-client-address'];
	// The web server overwrites this one header from its own getClientAddress().
	// Forwarded, X-Forwarded-For, chains and headers from untrusted sockets confer no identity.
	return trusted.has(peer) && typeof forwarded === 'string' && isIP(forwarded)
		? normalizedAddress(forwarded)
		: peer;
}

/** Read on demand. Cancelling/limiting a body drains it without destroying the response socket. */
function requestBody(incoming: IncomingMessage, maxBytes: number) {
	let controller: ReadableStreamDefaultController<Uint8Array>;
	let waiting = false;
	let finished = false;
	let size = 0;
	function detach() {
		incoming.off('readable', pump);
		incoming.off('end', end);
		incoming.off('error', fail);
	}
	function end() {
		if (finished) return;
		finished = true;
		detach();
		controller.close();
	}
	function fail(cause: Error) {
		if (finished) return;
		finished = true;
		detach();
		controller.error(cause);
	}
	function pump() {
		if (!waiting || finished) return;
		const chunk: Buffer | null = incoming.read();
		if (!chunk) {
			if (incoming.readableEnded) end();
			return;
		}
		waiting = false;
		size += chunk.byteLength;
		if (size > maxBytes) {
			fail(new HttpError(413, { message: 'Request body exceeds the size limit' }));
			incoming.resume();
			return;
		}
		controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
	}
	const body = new ReadableStream<Uint8Array>(
		{
			start(value) {
				controller = value;
				incoming.on('readable', pump);
				incoming.once('end', end);
				incoming.once('error', fail);
			},
			pull() {
				waiting = true;
				pump();
			},
			cancel() {
				finished = true;
				detach();
				incoming.resume();
			}
		},
		{ highWaterMark: 0 }
	);
	return body;
}

async function drain(outgoing: ServerResponse, signal: AbortSignal) {
	signal.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		const done = (cause?: unknown) => {
			outgoing.off('drain', ready);
			outgoing.off('error', failed);
			signal.removeEventListener('abort', aborted);
			if (cause) reject(cause);
			else resolve();
		};
		const ready = () => done();
		const failed = (cause: Error) => done(cause);
		const aborted = () => done(signal.reason);
		outgoing.once('drain', ready);
		outgoing.once('error', failed);
		signal.addEventListener('abort', aborted, { once: true });
		if (signal.aborted) aborted();
	});
}

export async function writeNodeResponse(
	response: Response,
	outgoing: ServerResponse,
	signal: AbortSignal
) {
	if (signal.aborted) {
		await response.body?.cancel(signal.reason).catch(() => {});
		signal.throwIfAborted();
	}
	for (const [name, value] of response.headers) {
		if (name !== 'set-cookie') outgoing.setHeader(name, value);
	}
	const cookies = response.headers.getSetCookie();
	if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
	outgoing.writeHead(response.status, response.statusText || undefined);
	// EventSource must receive headers even when the first event is still pending.
	outgoing.flushHeaders();
	if (!response.body) {
		outgoing.end();
		return;
	}
	const reader = response.body.getReader();
	const abort = () => {
		void reader.cancel(signal.reason).catch(() => {});
	};
	signal.addEventListener('abort', abort, { once: true });
	try {
		signal.throwIfAborted();
		for (;;) {
			const chunk = await reader.read();
			signal.throwIfAborted();
			if (chunk.done) break;
			if (!outgoing.write(chunk.value)) await drain(outgoing, signal);
		}
		outgoing.end();
	} finally {
		signal.removeEventListener('abort', abort);
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

export function createNodeHttpServer(
	application: HttpApplication,
	configuration: NodeHttpConfiguration
) {
	const trusted = new Set(
		parseTrustedProxyAddresses(configuration.trustedProxyAddresses?.join(','))
	);
	const maxBodyBytes = configuration.maxBodyBytes ?? 12 * 1024 * 1024;
	if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0)
		throw new Error('Invalid HTTP body limit');
	let closing: Promise<void> | undefined;
	let stopped = false;
	const server = createServer(async (incoming, outgoing) => {
		const cancellation = new AbortController();
		const abort = () => cancellation.abort();
		incoming.once('aborted', abort);
		outgoing.once('close', abort);
		let body: ReadableStream<Uint8Array> | undefined;
		try {
			if (stopped) error(503, 'Service Unavailable');
			const target = incoming.url ?? '/';
			if (!target.startsWith('/') || target.startsWith('//')) error(400, 'Invalid request target');
			const headers = new Headers();
			for (let i = 0; i < incoming.rawHeaders.length; i += 2)
				headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
			const method = incoming.method ?? 'GET';
			const hasBody =
				incoming.headers['transfer-encoding'] !== undefined ||
				Number(incoming.headers['content-length'] ?? 0) > 0;
			if (!['GET', 'HEAD'].includes(method) && hasBody) body = requestBody(incoming, maxBodyBytes);
			const request = new Request(new URL(target, configuration.publicOrigin), {
				method,
				headers,
				body,
				signal: cancellation.signal,
				...(body ? { duplex: 'half' } : {})
			});
			const response = await application.handle(request, {
				clientAddress: clientAddress(incoming, trusted)
			});
			await writeNodeResponse(response, outgoing, cancellation.signal);
		} catch (cause) {
			if (!outgoing.headersSent && !cancellation.signal.aborted) {
				await writeNodeResponse(errorResponse(cause), outgoing, cancellation.signal).catch(() =>
					outgoing.destroy()
				);
			} else if (!outgoing.writableEnded) outgoing.destroy();
		} finally {
			incoming.off('aborted', abort);
			outgoing.off('close', abort);
			await body?.cancel().catch(() => {});
			if (!incoming.complete) incoming.resume();
		}
	});
	return {
		server,
		async listen(port: number, host = '127.0.0.1') {
			if (stopped) throw new Error('HTTP server is closed');
			await new Promise<void>((resolve, reject) => {
				const failed = (cause: Error) => {
					server.off('listening', ready);
					reject(cause);
				};
				const ready = () => {
					server.off('error', failed);
					resolve();
				};
				server.once('error', failed);
				server.once('listening', ready);
				server.listen(port, host);
			});
			const address = server.address();
			if (!address || typeof address === 'string') throw new Error('HTTP server did not bind TCP');
			return address;
		},
		close() {
			return (closing ??= (async () => {
				stopped = true;
				// Closing subscriptions wakes pending reads. Waiting for HTTP first deadlocks SSE shutdown.
				await application.closeStreams();
				if (server.listening)
					await new Promise<void>((resolve, reject) => {
						server.close((cause) => (cause ? reject(cause) : resolve()));
					});
			})());
		}
	};
}
