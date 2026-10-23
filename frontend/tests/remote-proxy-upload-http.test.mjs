import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * @typedef {{handler: import('node:http').RequestListener}} WebHandlerModule
 * @typedef {{status: number | undefined, body: string, bytesAtResponse: number}} PostResult
 */

function deferred() {
	/** @type {PromiseWithResolvers<void>} */
	const result = Promise.withResolvers();
	return result;
}
/** @param {Promise<void>} promise */
async function settled(promise) {
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	try {
		/** @type {Promise<never>} */
		const timeout = new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error('Proxy cancellation did not settle')), 3000);
		});
		await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * @param {string} origin
 * @param {string} body
 * @param {boolean} chunked
 * @param {boolean} slow
 * @returns {Promise<PostResult>}
 */
function post(origin, body, chunked, slow) {
	return new Promise((resolve, reject) => {
		let written = 0;
		const request = httpRequest(
			`${origin}/api/web/v1/commands`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(chunked ? {} : { 'content-length': Buffer.byteLength(body) })
				}
			},
			(response) => {
				const bytesAtResponse = written;
				/** @type {Buffer[]} */
				const chunks = [];
				response.on('data', (/** @type {Buffer} */ chunk) => chunks.push(chunk));
				response.on('end', () =>
					resolve({
						status: response.statusCode,
						body: Buffer.concat(chunks).toString(),
						bytesAtResponse
					})
				);
				response.on('error', reject);
			}
		);
		request.on('error', reject);
		request.setTimeout(5000, () => request.destroy(new Error('Proxy upload timed out')));
		void (async () => {
			if (chunked || slow) {
				for (let offset = 0; offset < body.length && !request.destroyed; offset += 16384) {
					const chunk = body.slice(offset, offset + 16384);
					written += chunk.length;
					request.write(chunk);
					if (slow) await delay(2);
				}
				if (!request.destroyed) request.end();
			} else {
				written = body.length;
				request.end(body);
			}
		})();
	});
}

test(
	'built web preserves upload limits and HTTP stream lifecycle',
	{ timeout: 20000 },
	async (t) => {
		/** @type {import('node:http').RequestListener} */
		let handler;
		const web = createServer((request, response) => handler(request, response));
		web.listen(0, '127.0.0.1');
		await once(web, 'listening');
		const webAddress = web.address();
		assert.ok(webAddress && typeof webAddress !== 'string');
		const webOrigin = `http://127.0.0.1:${webAddress.port}`;
		const uploadStarted = deferred();
		const uploadAborted = deferred();
		const streamCancelled = deferred();

		const probe = createServer();
		probe.listen(0, '127.0.0.1');
		await once(probe, 'listening');
		const address = probe.address();
		assert.ok(address && typeof address !== 'string');
		await new Promise((resolve, reject) =>
			probe.close((error) => (error ? reject(error) : resolve(undefined)))
		);
		const apiOrigin = `http://127.0.0.1:${address.port}`;
		const api = spawn(
			fileURLToPath(new URL('../../backend/api/.venv/bin/python', import.meta.url)),
			[fileURLToPath(new URL('./fixtures/proxy-api.py', import.meta.url))],
			{
				env: { ...process.env, API_PORT: String(address.port) },
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		assert.ok(api.stdout && api.stderr);
		const events = createInterface({ input: api.stdout });
		events.on('line', (line) => {
			if (line === 'upload-started') uploadStarted.resolve();
			if (line === 'upload-aborted') uploadAborted.resolve();
			if (line === 'stream-cancelled') streamCancelled.resolve();
		});
		try {
			await new Promise((resolve, reject) => {
				const reader = createInterface({ input: api.stderr });
				const fail = () => {
					clearTimeout(timer);
					reject(new Error('Installed proxy API fixture failed to start'));
				};
				const timer = setTimeout(fail, 10000);
				api.once('error', fail);
				api.once('exit', fail);
				reader.on('line', (line) => {
					if (!line.includes(`Uvicorn running on ${apiOrigin} `)) return;
					clearTimeout(timer);
					reader.close();
					api.off('error', fail);
					api.off('exit', fail);
					resolve(undefined);
				});
			});
			api.stderr.resume();

			process.env.API_INTERNAL_URL = apiOrigin;
			process.env.APP_ORIGIN = webOrigin;
			process.env.BODY_SIZE_LIMIT = process.env.TEST_PROXY_WEB_BODY_LIMIT ?? '512K';
			delete process.env.DATABASE_URL;
			const handlerUrl = new URL('../build/handler.js', import.meta.url);
			/** @type {WebHandlerModule} */
			const built = await import(handlerUrl.href);
			handler = built.handler;
			for (const slow of [false, true]) {
				const body = JSON.stringify({
					operation: 'inventory.add',
					input: { notes: 'x'.repeat((slow ? 2 : 1) * 1024 * 1024) }
				});
				for (const chunked of [false, true]) {
					await t.test(
						`413 parity for ${chunked ? 'chunked' : 'known-length'} ${slow ? 'throttled' : 'immediate'} upload`,
						async () => {
							const direct = await post(apiOrigin, body, chunked, false);
							assert.equal(direct.status, 413);
							const proxied = await post(webOrigin, body, chunked, slow);
							assert.equal(proxied.status, direct.status);
							assert.deepEqual(JSON.parse(proxied.body), JSON.parse(direct.body));
							if (slow)
								assert.ok(
									proxied.bytesAtResponse < body.length,
									'API response must arrive before the rest of the upload'
								);
						}
					);
				}
			}
			await t.test(
				'raw credentials, Origin, trusted address and separate cookies survive real HTTP',
				async () => {
					const response = await fetch(`${webOrigin}/api/proxy-test/headers`, {
						headers: {
							authorization: 'Bearer invalid',
							cookie: 'spellbook_session=test-cookie',
							origin: 'https://foreign.test',
							'x-spellbook-client-address': '203.0.113.10',
							'x-forwarded-for': '203.0.113.10'
						}
					});
					assert.equal(response.status, 201);
					assert.equal(response.headers.get('cache-control'), 'no-store');
					assert.equal(response.headers.getSetCookie().length, 2);
					/** @type {{headers: Record<string, string>, clientAddress: string}} */
					const data = await response.json();
					assert.equal(data.headers.authorization, 'Bearer invalid');
					assert.equal(data.headers.cookie, 'spellbook_session=test-cookie');
					assert.equal(data.headers.origin, 'https://foreign.test');
					assert.equal(data.headers['x-forwarded-for'], undefined);
					assert.equal(data.headers['x-spellbook-client-address'], '127.0.0.1');
					assert.equal(data.clientAddress, '127.0.0.1');
				}
			);
			await t.test(
				'SSE remains unbuffered and response reader cancellation reaches the API',
				async () => {
					const response = await fetch(`${webOrigin}/api/proxy-test/events`);
					assert.equal(response.headers.get('x-accel-buffering'), 'no');
					assert.ok(response.body);
					const reader = response.body.getReader();
					assert.match(new TextDecoder().decode((await reader.read()).value), /event: reset/);
					await reader.cancel();
					await settled(streamCancelled.promise);
				}
			);
			await t.test('aborting a chunked browser upload aborts the real API request', async () => {
				const request = httpRequest(`${webOrigin}/api/proxy-test/upload-abort`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' }
				});
				request.on('error', () => {});
				try {
					request.write('{"value":"unfinished');
					await settled(uploadStarted.promise);
					request.destroy();
					await settled(uploadAborted.promise);
				} finally {
					request.destroy();
				}
			});
		} finally {
			await Promise.all([
				(async () => {
					if (!api.pid || api.exitCode !== null || api.signalCode !== null) return;
					const exited = once(api, 'exit');
					api.kill('SIGTERM');
					await settled(exited.then(() => undefined));
					events.close();
				})(),
				new Promise((resolve, reject) =>
					web.close((cause) => (cause ? reject(cause) : resolve(undefined)))
				)
			]);
		}
	}
);
