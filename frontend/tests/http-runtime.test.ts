import { test } from 'node:test';
import pg from 'pg';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';

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
			startHttpApplication(
				`http://127.0.0.1:${address.port}`,
				pathToFileURL(folder + '/'),
				'entry.mjs'
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
			startHttpApplication(origin, pathToFileURL(folder + '/'), 'entry.mjs'),
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
		child = await startHttpApplication(origin, pathToFileURL(folder + '/'), 'entry.mjs');
		assert.equal(await (await fetch(origin)).text(), 'owned');
		await stopHttpApplication(child);
		assert.notEqual(child.exitCode, null);
	} finally {
		if (child) await stopHttpApplication(child);
		await rm(folder, { recursive: true, force: true });
	}
});

test(
	'SavedState listener closes and built Node exits naturally after SSE shutdown',
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
						const response = await fetch(origin + '/api/auth/register', {
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
						const stream = await fetch(origin + '/api/account/events', {
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
						const listenerName = 'spellbook_saved_state:' + child.pid;
						assert.equal(
							(
								await pool.query(
									'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1',
									[listenerName]
								)
							).rows[0].n,
							1
						);
						if (!keepOpen) {
							controller.abort();
							await reader.cancel().catch(() => {});
							reader = undefined;
							const logout = await fetch(origin + '/api/auth/logout', {
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
							child!.once('exit', () => {
								clearTimeout(timer);
								resolve(true);
							});
						});
						child.kill('SIGTERM');
						const naturalExit = await exited;
						const listenerRows = (
							await pool.query(
								`SELECT pid,state,CASE WHEN query='LISTEN spellbook_saved_state' THEN query ELSE 'other' END AS query_kind FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1`,
								[listenerName]
							)
						).rows;
						t.diagnostic(
							JSON.stringify({
								pid: child.pid,
								keepOpen,
								naturalExit,
								exitAfterTermMs: Math.round(performance.now() - started),
								exitCode: child.exitCode,
								listenerRows
							})
						);
						await assert.rejects(
							fetch(origin, { signal: AbortSignal.timeout(1000) }),
							'Owned HTTP listener must be closed'
						);
						assert.equal(naturalExit, true, 'Owned Node process must exit naturally within15s');
						assert.equal(child.exitCode, 0, 'Forced cleanup or signal termination is not success');
						assert.equal(child.signalCode, null);
						assert.equal(
							(
								await pool.query(
									'SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1',
									[listenerName]
								)
							).rows[0].n,
							0
						);
						t.diagnostic(
							JSON.stringify({
								pid: child.pid,
								keepOpen,
								exitAfterTermMs: Math.round(performance.now() - started),
								exitCode: child.exitCode,
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
