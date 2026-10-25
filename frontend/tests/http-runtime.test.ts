import { test } from 'node:test';
import pg from 'pg';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChildProcess } from 'node:child_process';
import {
	httpApiTestOrigin,
	httpTestOrigin,
	startHttpApplication,
	stopHttpApplication,
	startHttpProcess,
	stopHttpProcess,
	webTestEnvironment
} from './http-runtime.ts';

async function unusedOrigin(): Promise<string> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve()))
	);
	return `http://127.0.0.1:${address.port}`;
}

test('HTTP test origin rejects a mismatched origin or invalid port before startup', () => {
	assert.equal(
		httpTestOrigin({ TEST_HTTP_PORT: '5192', APP_ORIGIN: 'http://127.0.0.1:5192' }),
		'http://127.0.0.1:5192'
	);
	assert.throws(
		() => httpTestOrigin({ TEST_HTTP_PORT: '5192', APP_ORIGIN: 'http://127.0.0.1:5191' }),
		/same origin/
	);
	for (const port of ['abc', '0', '65536', '5192/other']) {
		assert.throws(() => httpTestOrigin({ TEST_HTTP_PORT: port }), /valid TCP port/);
		assert.throws(() => httpApiTestOrigin({ TEST_API_PORT: port }), /valid TCP port/);
	}
	assert.equal(httpApiTestOrigin({ TEST_API_PORT: '5193' }), 'http://127.0.0.1:5193');
});

test('web environment excludes database, worker, storage and inherited proxy authority', () => {
	assert.deepEqual(
		webTestEnvironment({
			PATH: '/bin',
			PUBLIC_NAME: 'Spellbook',
			DEMO_MODE: 'true',
			BODY_SIZE_LIMIT: '24M',
			DATABASE_URL: 'private',
			TEST_DATABASE_URL: 'private',
			PGHOST: 'private',
			SCAN_WORKER_URL: 'private',
			S3_SECRET_ACCESS_KEY: 'private',
			AWS_SECRET_ACCESS_KEY: 'private',
			API_TRUSTED_PROXY_ADDRESSES: '*',
			ORIGIN: 'https://unrelated.invalid',
			ADDRESS_HEADER: 'x-forwarded-for',
			NODE_OPTIONS: '--env-file=.env'
		}),
		{ PATH: '/bin', DEMO_MODE: 'true', PUBLIC_NAME: 'Spellbook', BODY_SIZE_LIMIT: '24M' }
	);
});

test('web environment defaults to a Scan-sized transport body limit', () => {
	assert.deepEqual(webTestEnvironment({}), { BODY_SIZE_LIMIT: '12M' });
	assert.deepEqual(webTestEnvironment({ BODY_SIZE_LIMIT: '' }), { BODY_SIZE_LIMIT: '12M' });
});

test('application owns separate API/web children and gives only API private configuration', async () => {
	const origin = await unusedOrigin();
	const apiOrigin = await unusedOrigin();
	const entrypoint = new URL('./fixtures/http-runtime-child.mjs', import.meta.url).pathname;
	let application: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	const prior = {
		DATABASE_URL: process.env.DATABASE_URL,
		TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
		S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
		SCAN_WORKER_URL: process.env.SCAN_WORKER_URL,
		BODY_SIZE_LIMIT: process.env.BODY_SIZE_LIMIT
	};
	try {
		for (const name of Object.keys(prior)) process.env[name] = 'owned-runtime-fixture';
		delete process.env.BODY_SIZE_LIMIT;
		application = await startHttpApplication(origin, new URL('../', import.meta.url), entrypoint, {
			apiOrigin,
			apiEntrypoint: entrypoint
		});
		assert.notEqual(application.api.pid, application.web.pid);
		const api = await (await fetch(apiOrigin)).json();
		const web = await (await fetch(origin)).json();
		assert.deepEqual(api, {
			pid: application.api.pid,
			api: true,
			publicOrigin: origin,
			trustedProxies: '127.0.0.1,::1',
			hasDatabase: true,
			hasTestDatabase: true,
			hasStorageSecret: true,
			hasWorker: true
		});
		assert.deepEqual(web, {
			pid: application.web.pid,
			api: false,
			publicOrigin: origin,
			apiInternalUrl: apiOrigin,
			bodySizeLimit: '12M',
			hasDatabase: false,
			hasTestDatabase: false,
			hasStorageSecret: false,
			hasWorker: false
		});
		await stopHttpApplication(application);
		for (const child of [application.api, application.web]) {
			assert.equal(child.exitCode, 0);
			assert.equal(child.signalCode, null);
		}
	} finally {
		for (const [name, value] of Object.entries(prior)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		if (application) await stopHttpApplication(application);
	}
});

test('application preserves the web transport body-limit override', async () => {
	const origin = await unusedOrigin();
	const apiOrigin = await unusedOrigin();
	const entrypoint = new URL('./fixtures/http-runtime-child.mjs', import.meta.url).pathname;
	const prior = process.env.BODY_SIZE_LIMIT;
	let application: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	try {
		process.env.BODY_SIZE_LIMIT = '24M';
		application = await startHttpApplication(origin, new URL('../', import.meta.url), entrypoint, {
			apiOrigin,
			apiEntrypoint: entrypoint
		});
		const web = await (await fetch(origin)).json();
		assert.equal(web.bodySizeLimit, '24M');
		assert.equal(web.hasDatabase, false);
		assert.equal(web.hasStorageSecret, false);
	} finally {
		if (prior === undefined) delete process.env.BODY_SIZE_LIMIT;
		else process.env.BODY_SIZE_LIMIT = prior;
		if (application) await stopHttpApplication(application);
	}
});

test('occupied API port fails before starting web or contacting the existing service', async () => {
	let requests = 0;
	const server = createServer((_, response) => {
		requests++;
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	const origin = await unusedOrigin();
	try {
		await assert.rejects(
			startHttpApplication(origin, new URL('../', import.meta.url), 'does-not-exist.js', {
				apiOrigin: `http://127.0.0.1:${address.port}`
			}),
			/occupied/
		);
		assert.equal(requests, 0);
		await assert.rejects(fetch(origin));
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
	}
});

test('web startup failure gracefully closes its already-started API', async () => {
	const origin = await unusedOrigin();
	const apiOrigin = await unusedOrigin();
	await assert.rejects(
		startHttpApplication(origin, new URL('../', import.meta.url), 'does-not-exist.js', {
			apiOrigin,
			apiEntrypoint: new URL('./fixtures/http-runtime-child.mjs', import.meta.url).pathname
		}),
		/exited before listening/
	);
	await assert.rejects(fetch(apiOrigin));
});

test('application rejects a shared API/web port and cleanup rejects unowned processes', async () => {
	const origin = await unusedOrigin();
	await assert.rejects(
		startHttpApplication(origin, new URL('../', import.meta.url), undefined, {
			apiOrigin: origin
		}),
		/separate HTTP test ports/
	);
	await assert.rejects(stopHttpProcess(new ChildProcess()), /unowned HTTP process/);
});

test('listening output without a bound socket cannot establish readiness', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'spellbook-http-runtime-'));
	const origin = await unusedOrigin();
	await writeFile(
		join(folder, 'entry.mjs'),
		`console.log('Listening on ${origin}');setInterval(()=>{},1000);`
	);
	try {
		await assert.rejects(
			startHttpProcess(origin, pathToFileURL(folder + '/'), 'entry.mjs', {}),
			/listener is unavailable/
		);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('occupied origin fails before spawning or contacting the existing application', async () => {
	const server = createServer((_, response) => {
		requests++;
		response.end('existing application');
	});
	let requests = 0;
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	const folder = await mkdtemp(join(tmpdir(), 'spellbook-http-runtime-'));
	const marker = join(folder, 'spawned');
	await writeFile(
		join(folder, 'entry.mjs'),
		`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'spawned');`
	);
	try {
		await assert.rejects(
			startHttpProcess(
				`http://127.0.0.1:${address.port}`,
				pathToFileURL(folder + '/'),
				'entry.mjs',
				{}
			),
			/occupied/
		);
		await assert.rejects(access(marker), { code: 'ENOENT' });
		assert.equal(requests, 0);
	} finally {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve()))
		);
		await rm(folder, { recursive: true, force: true });
	}
});

test('startup exit cannot count an HTTP response as owned readiness', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'spellbook-http-runtime-'));
	const origin = await unusedOrigin();
	await writeFile(join(folder, 'entry.mjs'), 'process.exit(7);');
	try {
		await assert.rejects(
			startHttpProcess(origin, pathToFileURL(folder + '/'), 'entry.mjs', {
				HOST: '127.0.0.1',
				PORT: new URL(origin).port
			}),
			/exited before listening/
		);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test('owned application must listen before readiness and can be stopped', async () => {
	const folder = await mkdtemp(join(tmpdir(), 'spellbook-http-runtime-'));
	const origin = await unusedOrigin();
	await writeFile(
		join(folder, 'entry.mjs'),
		`import {createServer} from 'node:http';const server=createServer((_,response)=>response.end('owned'));server.listen(Number(process.env.PORT),process.env.HOST,()=>console.log('Listening on http://'+process.env.HOST+':'+process.env.PORT));process.on('SIGTERM',()=>server.close());`
	);
	let child;
	try {
		child = await startHttpProcess(origin, pathToFileURL(folder + '/'), 'entry.mjs', {
			HOST: '127.0.0.1',
			PORT: new URL(origin).port
		});
		assert.equal(await (await fetch(origin)).text(), 'owned');
		await stopHttpProcess(child);
		assert.notEqual(child.exitCode, null);
	} finally {
		if (child) await stopHttpProcess(child);
		await rm(folder, { recursive: true, force: true });
	}
});

test(
	'SavedState listener closes and installed Python exits naturally after SSE shutdown',
	{
		skip: !process.env.TEST_DATABASE_URL
	},
	async (t) => {
		const databaseUrl = process.env.TEST_DATABASE_URL;
		assert.ok(
			databaseUrl && databaseUrl === process.env.DATABASE_URL,
			'Shutdown regression requires matching disposable database URLs'
		);
		const origin = httpTestOrigin();
		const pool = new pg.Pool({ connectionString: databaseUrl });
		const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
		try {
			await ensureDeckCatalogFixture(pool);
			for (const keepOpen of [false, true]) {
				await t.test(keepOpen ? 'active SSE' : 'closed SSE', async () => {
					let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
					let accountId: string | undefined;
					let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
					const controller = new AbortController();
					try {
						child = await startHttpApplication(origin, new URL('../', import.meta.url));
						const response = await fetch(origin + '/api/v1/auth/register', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								username: 'shutdown_' + crypto.randomUUID().slice(0, 8),
								password: 'owned-shutdown-test-password'
							})
						});
						assert.equal(response.status, 201);
						const auth = await response.json();
						accountId = auth.user.accountId;
						const stream = await fetch(origin + '/api/v1/account/events', {
							headers: { authorization: 'Bearer ' + auth.token },
							signal: controller.signal
						});
						assert.equal(stream.status, 200);
						assert.ok(stream.body);
						reader = stream.body.getReader();
						let frames = '';
						while (!frames.includes('event: reset')) {
							const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
							assert.equal(chunk.done, false);
							frames += new TextDecoder().decode(chunk.value);
						}
						const listeners = (
							await pool.query(
								'SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND query=$1',
								['LISTEN spellbook_saved_state']
							)
						).rows;
						assert.equal(listeners.length, 1, 'SSE requires one physical SavedState listener');
						const listenerPid = listeners[0].pid;
						if (!keepOpen) {
							controller.abort();
							await reader.cancel().catch(() => {});
							reader = undefined;
							const logout = await fetch(origin + '/api/v1/auth/logout', {
								method: 'POST',
								headers: {
									authorization: 'Bearer ' + auth.token,
									'content-type': 'application/json'
								},
								body: '{}'
							});
							assert.equal(logout.status, 204);
							await delay(100);
						}
						const started = performance.now();
						const exited = new Promise<boolean>((resolve) => {
							const timer = setTimeout(() => resolve(false), 15000);
							child!.api.once('exit', () => {
								clearTimeout(timer);
								resolve(true);
							});
						});
						child.api.kill('SIGTERM');
						const naturalExit = await exited;
						const listenerRows = (
							await pool.query(
								`SELECT pid,state,CASE WHEN query='LISTEN spellbook_saved_state' THEN query ELSE 'other' END AS query_kind FROM pg_stat_activity WHERE datname=current_database() AND pid=$1`,
								[listenerPid]
							)
						).rows;
						t.diagnostic(
							JSON.stringify({
								pid: child.api.pid,
								keepOpen,
								naturalExit,
								exitAfterTermMs: Math.round(performance.now() - started),
								exitCode: child.api.exitCode,
								listenerRows
							})
						);
						await assert.rejects(
							fetch(child.apiOrigin, { signal: AbortSignal.timeout(1000) }),
							'Owned HTTP listener must be closed'
						);
						assert.equal(naturalExit, true, 'Owned Python process must exit naturally within 15s');
						assert.equal(
							child.api.exitCode,
							null,
							'Uvicorn re-raises the captured shutdown signal after graceful shutdown'
						);
						assert.equal(child.api.signalCode, 'SIGTERM');
						assert.equal(
							(
								await pool.query(
									'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid=$1',
									[listenerPid]
								)
							).rows[0].n,
							0
						);
						t.diagnostic(
							JSON.stringify({
								pid: child.api.pid,
								keepOpen,
								exitAfterTermMs: Math.round(performance.now() - started),
								exitCode: child.api.exitCode,
								listenerConnections: 0
							})
						);
					} finally {
						controller.abort();
						await reader?.cancel().catch(() => {});
						if (child) await stopHttpApplication(child);
						if (accountId)
							await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [accountId]);
					}
				});
			}
		} finally {
			await pool.end();
		}
	}
);
