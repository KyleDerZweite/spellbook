import { test } from 'node:test';
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
