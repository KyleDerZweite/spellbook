import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import {
	httpProcessDiagnostics,
	startHttpProcess,
	stopHttpProcess,
	webTestEnvironment
} from './http-runtime.ts';

/** @typedef {{status: number | undefined, headers: import('node:http').IncomingHttpHeaders, body: string}} Result */

/** @param {import('node:http').Server} server */
async function listen(server) {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');
	return `http://127.0.0.1:${address.port}`;
}

/**
 * @param {string} url
 * @param {string} method
 * @param {string[]} headers
 * @param {string | undefined} [body]
 * @returns {Promise<Result>}
 */
function rawRequest(url, method, headers, body) {
	return new Promise((resolve, reject) => {
		const outgoing = request(
			url,
			{ method, headers: ['Host', new URL(url).host, ...headers] },
			(response) => {
				/** @type {Buffer[]} */
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('error', reject);
				response.on('end', () =>
					resolve({
						status: response.statusCode,
						headers: response.headers,
						body: Buffer.concat(chunks).toString()
					})
				);
			}
		);
		outgoing.on('error', reject);
		outgoing.setTimeout(3000, () => outgoing.destroy(new Error('Raw Web request timed out')));
		outgoing.end(body);
	});
}

test('built Web rejects duplicate sensitive raw headers before any upstream work', async (t) => {
	/** @type {import('node:http').RequestListener} */
	let handler;
	const web = createServer((request, response) => handler(request, response));
	/** @type {{headers: import('node:http').IncomingHttpHeaders, body: string}[]} */
	const received = [];
	const upstream = createServer(async (request, response) => {
		let body = '';
		for await (const chunk of request) body += chunk;
		received.push({ headers: request.headers, body });
		response.setHeader('content-type', 'application/json');
		response.end(JSON.stringify({ ok: true }));
	});
	const webOrigin = await listen(web);
	const upstreamOrigin = await listen(upstream);
	try {
		process.env.APP_ORIGIN = webOrigin;
		process.env.API_INTERNAL_URL = upstreamOrigin;
		delete process.env.DATABASE_URL;
		const built = await import(new URL('../build/handler.js', import.meta.url).href);
		handler = built.handler;
		const base = [
			'Authorization',
			'Bearer dummy-token',
			'Origin',
			webOrigin,
			'Content-Type',
			'application/json'
		];
		for (const method of ['GET', 'PATCH']) {
			for (const [name, conflict] of [
				['Origin', 'https://foreign.example'],
				['Content-Type', 'application/octet-stream'],
				['Authorization', 'Basic duplicate']
			]) {
				for (const identical of [false, true]) {
					await t.test(`${method} duplicate ${name}, identical=${identical}`, async () => {
						const before = received.length;
						const firstValue = base[base.indexOf(name) + 1];
						const body = method === 'PATCH' ? '{"displayName":"Updated"}' : undefined;
						const result = await rawRequest(
							`${webOrigin}/api/v1/account/profile`,
							method,
							[
								...base,
								name.toLowerCase(),
								identical ? firstValue : conflict,
								...(body ? ['Content-Length', String(Buffer.byteLength(body))] : [])
							],
							body
						);
						assert.equal(result.status, 400);
						assert.deepEqual(JSON.parse(result.body), { status: 400, message: 'Invalid request' });
						assert.equal(result.headers['cache-control'], 'no-store');
						assert.equal(result.headers['x-robots-tag'], 'noindex, nofollow');
						assert.equal(received.length, before);
					});
				}
			}
		}
		await t.test(
			'native browser action rejects duplicates before session or action work',
			async () => {
				const before = received.length;
				const result = await rawRequest(`${webOrigin}/auth/login`, 'POST', [
					'Origin',
					webOrigin,
					'origin',
					webOrigin,
					'Content-Type',
					'application/x-www-form-urlencoded',
					'Content-Length',
					'0'
				]);
				assert.equal(result.status, 400);
				assert.equal(received.length, before);
			}
		);
		await t.test(
			'single bearer and Origin preserve JSON body and reach upstream once',
			async () => {
				const before = received.length;
				const body = '{"displayName":"Updated"}';
				const result = await rawRequest(
					`${webOrigin}/api/v1/account/profile`,
					'PATCH',
					[...base, 'Content-Length', String(Buffer.byteLength(body))],
					body
				);
				assert.equal(result.status, 200);
				assert.equal(received.length, before + 1);
				assert.equal(received.at(-1)?.headers.authorization, 'Bearer dummy-token');
				assert.equal(received.at(-1)?.headers.origin, webOrigin);
				assert.equal(received.at(-1)?.headers['content-type'], 'application/json');
				assert.equal(received.at(-1)?.body, body);
			}
		);
		await t.test('standalone production entrypoint runs the same raw-header guard', async () => {
			const probe = createServer();
			const origin = await listen(probe);
			await new Promise((resolve, reject) =>
				probe.close((error) => (error ? reject(error) : resolve(undefined)))
			);
			const child = await startHttpProcess(
				origin,
				new URL('../', import.meta.url),
				'build/index.js',
				{
					...webTestEnvironment(),
					APP_ORIGIN: origin,
					API_INTERNAL_URL: upstreamOrigin,
					HOST: '127.0.0.1',
					PORT: new URL(origin).port,
					SOCKET_PATH: '',
					LISTEN_PID: '0',
					LISTEN_FDS: '0',
					SHUTDOWN_TIMEOUT: '1'
				}
			);
			try {
				const before = received.length;
				const duplicate = await rawRequest(`${origin}/api/v1/account/profile`, 'GET', [
					'Authorization',
					'Bearer dummy-token',
					'authorization',
					'Basic duplicate'
				]);
				assert.equal(duplicate.status, 400);
				assert.equal(received.length, before);
				const normal = await rawRequest(`${origin}/api/v1/account/profile`, 'GET', [
					'Authorization',
					'Bearer dummy-token'
				]);
				assert.equal(normal.status, 200);
				assert.equal(received.length, before + 1);
			} finally {
				await stopHttpProcess(child);
			}
		});
	} finally {
		await Promise.all(
			[web, upstream].map(
				(server) =>
					new Promise((resolve, reject) =>
						server.close((error) => (error ? reject(error) : resolve(undefined)))
					)
			)
		);
	}
});

test('standalone built proxy retains coded unavailable diagnostics without request secrets', async () => {
	const probe = createServer();
	const apiOrigin = await listen(probe);
	await new Promise((resolve, reject) =>
		probe.close((error) => (error ? reject(error) : resolve(undefined)))
	);
	const webProbe = createServer();
	const origin = await listen(webProbe);
	await new Promise((resolve, reject) =>
		webProbe.close((error) => (error ? reject(error) : resolve(undefined)))
	);
	const child = await startHttpProcess(
		origin,
		new URL('../', import.meta.url),
		'build/index.js',
		{
			...webTestEnvironment(),
			APP_ORIGIN: origin,
			API_INTERNAL_URL: apiOrigin,
			HOST: '127.0.0.1',
			PORT: new URL(origin).port,
			SOCKET_PATH: '',
			LISTEN_PID: '0',
			LISTEN_FDS: '0',
			SHUTDOWN_TIMEOUT: '1'
		},
		false,
		'web'
	);
	try {
		const response = await fetch(origin + '/api/v1/account/profile?token=synthetic-secret', {
			headers: {
				authorization: 'Bearer synthetic-secret',
				cookie: 'spellbook_session=synthetic-secret'
			}
		});
		assert.equal(response.status, 503);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.deepEqual(await response.json(), {
			message: 'The API is temporarily unavailable. Try again.'
		});
	} finally {
		await stopHttpProcess(child);
	}
	const events = httpProcessDiagnostics(child);
	assert.deepEqual(
		events.filter((event) => event.lifecycle === 'error'),
		[
			{
				role: 'web',
				pid: child.pid,
				lifecycle: 'error',
				errorType: 'UpstreamUnavailable',
				networkCode: 'ECONNREFUSED'
			}
		]
	);
	assert.doesNotMatch(
		JSON.stringify(events),
		/synthetic-secret|authorization|cookie|https?:|token=/
	);
});
