import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(
	t,
	{
		running = false,
		seedFails = false,
		stopFails = false,
		containerId,
		appFails = false,
		webOrigin,
		apiPort,
		demoMode = 'false',
		bodySizeLimit,
		workerDataDir,
		copiedEnv = false,
		catalogExit
	} = {}
) {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-dev-'));
	const id = containerId || root.split('/').at(-1);
	for (const directory of ['api', 'workers/state', 'workers/catalog', 'workers/scan'])
		await mkdir(join(root, 'backend', directory), { recursive: true });
	await copyFile(new URL('../.env.example', import.meta.url), join(root, '.env'));
	await mkdir(join(root, 'scripts'));
	await mkdir(join(root, 'frontend'));
	await mkdir(join(root, 'bin'));
	await copyFile(new URL('./dev.mjs', import.meta.url), join(root, 'scripts/dev.mjs'));
	await mkdir(join(root, 'frontend/scripts'), { recursive: true });
	await copyFile(
		new URL('../frontend/scripts/dev.mjs', import.meta.url),
		join(root, 'frontend/scripts/dev.mjs')
	);

	await writeFile(join(root, 'database'), String(running));
	const executables = {
		pnpm: `
import {appendFileSync, writeFileSync} from 'node:fs';
const directory = process.cwd().split('/').at(-1);
const name = directory === 'api' ? 'backend' : directory;
if (process.argv.includes('spellbook-migrate')) process.exit(0);
if (process.argv.includes('spellbook-demo-seed')) process.exit(${seedFails ? 1 : 0});
const record = (value) => appendFileSync(process.env.FIXTURE_ROOT + '/events', JSON.stringify(value) + '\\n');
record({event:'start',name,demo:process.env.DEMO_MODE,bodySizeLimit:process.env.BODY_SIZE_LIMIT,api:process.env.API_INTERNAL_URL,host:process.env.API_HOST,port:process.env.API_PORT,trusted:process.env.API_TRUSTED_PROXY_ADDRESSES,database:process.env.DATABASE_URL,s3:process.env.S3_SECRET_ACCESS_KEY,pgPassword:process.env.PGPASSWORD,workerDataDir:process.env.WORKER_DATA_DIR,args:process.argv.slice(2)});
if (name === 'catalog') writeFileSync(process.env.WORKER_DATA_DIR + '/probe', 'writable');
console.log('fixture ready ' + name);
if (name === 'catalog' && process.env.SYNC_INTERVAL === 'manual' && process.env.FIXTURE_CATALOG_EXIT) setTimeout(() => {record({event:'complete',name}); process.exit(Number(process.env.FIXTURE_CATALOG_EXIT));},150);
setInterval(() => {}, 1000);
if (name === 'backend' && process.env.FIXTURE_APP_FAILS === 'true') setTimeout(()=>process.exit(7),150);
process.on('SIGTERM', () => {record({event:'stop',name}); process.exit(0);});`,
		podman: `
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const path = process.env.FIXTURE_ROOT + '/database';
if (args[0] === 'inspect') console.log(JSON.stringify([{Id: process.env.FIXTURE_ID, State: {Running: readFileSync(path, 'utf8') === 'true'}}]));
else if (args[0] === 'start') writeFileSync(path, 'true');
else if (args[0] === 'stop') {
	if (process.env.FIXTURE_STOP_FAIL === 'true') process.exit(1);
	if (args[2] !== '-1') process.exit(2);
	writeFileSync(path, 'false');
}
`
	};
	executables.uvx = executables.pnpm;
	for (const [name, source] of Object.entries(executables)) {
		await writeFile(join(root, 'bin', name), `#!${process.execPath}\n${source}`);
		await chmod(join(root, 'bin', name), 0o700);
	}
	const children = new Set();
	t.after(async () => {
		for (const child of children) {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill('SIGTERM');
				await once(child, 'exit');
			}
		}
		await rm(root, { recursive: true, force: true });
		if (stopFails)
			await rm(join(homedir(), '.cache/spellbook/dev-containers', `${id}.pid`), { force: true });
	});
	function launch(args, legacy = false) {
		const child = spawn(
			process.execPath,
			[
				...(copiedEnv ? ['--env-file=' + join(root, '.env')] : []),
				join(root, legacy ? 'frontend/scripts/dev.mjs' : 'scripts/dev.mjs'),
				...args
			],
			{
				cwd: join(root, 'frontend'),
				env: {
					...process.env,
					PATH: `${join(root, 'bin')}:${process.env.PATH}`,
					DATABASE_URL: 'postgres://localhost/spellbook_demo',
					DEV_DATABASE_CONTAINER: 'fixture',
					FIXTURE_ROOT: root,
					FIXTURE_ID: id,
					FIXTURE_STOP_FAIL: String(stopFails),
					FIXTURE_APP_FAILS: String(appFails),
					DEMO_MODE: demoMode,
					WORKER_DATA_DIR:
						workerDataDir === 'absolute' ? join(root, '.local/absolute') : workerDataDir,
					SYNC_INTERVAL: catalogExit === undefined ? 'daily' : 'manual',
					FIXTURE_CATALOG_EXIT: catalogExit === undefined ? '' : String(catalogExit),
					S3_SECRET_ACCESS_KEY: 'fixture-only-secret',
					PGPASSWORD: 'fixture-only-password',
					DEV_APP_ORIGIN: webOrigin || 'http://localhost:5173',
					API_PORT: apiPort || '3001',
					BODY_SIZE_LIMIT: bodySizeLimit
				},
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		children.add(child);
		let output = '';
		child.stdout.on('data', (data) => {
			output += data;
		});
		child.stderr.on('data', (data) => {
			output += data;
		});
		const exited = once(child, 'exit').then(([code]) => ({ code, output }));
		return { child, exited, output: () => output };
	}
	async function ready(server) {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (
				server.output().includes('fixture ready frontend') &&
				server.output().includes('fixture ready backend') &&
				server.output().includes('fixture ready state')
			)
				return;
			if (server.child.exitCode !== null) throw new Error(server.output());
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		throw new Error(`Launcher did not become ready: ${server.output()}`);
	}
	return {
		root,
		id,
		launch,
		ready,
		database: () => readFile(join(root, 'database'), 'utf8')
	};
}

test('the removed --scan flag is rejected before startup', async (t) => {
	const f = await fixture(t);
	const result = await f.launch(['start', '--scan']).exited;
	assert.equal(result.code, 1);
	assert.match(result.output, /Usage: \.\/dev\.sh \[start \[--demo\] \| stop\]/);
	assert.equal(await f.database(), 'false');
});

test('demo start and stop clean up only their owned database', async (t) => {
	const f = await fixture(t);
	const server = f.launch(['start', '--demo']);
	await f.ready(server);
	assert.equal(await f.database(), 'true');
	assert.equal((await f.launch(['start']).exited).code, 1);
	assert.equal((await f.launch(['stop']).exited).code, 0);
	assert.equal((await server.exited).code, 0);
	assert.equal(await f.database(), 'false');
	assert.equal((await f.launch(['stop']).exited).code, 0);
});

test('an already-running database survives launcher shutdown', async (t) => {
	const f = await fixture(t, { running: true });
	const server = f.launch(['start']);
	await f.ready(server);
	server.child.kill('SIGINT');
	assert.equal((await server.exited).code, 0);
	assert.equal(await f.database(), 'true');
});

test('failed demo preparation cleans up the database and permits retry', async (t) => {
	const f = await fixture(t, { seedFails: true });
	assert.equal((await f.launch(['start', '--demo']).exited).code, 1);
	assert.equal(await f.database(), 'false');
	const server = f.launch(['start']);
	await f.ready(server);
	assert.equal((await f.launch(['stop']).exited).code, 0);
	await server.exited;
});

test('unverified ownership is refused without deleting its record', async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.root, '.local'));
	const path = join(f.root, '.local/dev.pid');
	const state = JSON.stringify({ pid: process.pid, identity: 'unverified' });
	await writeFile(path, state);
	const result = await f.launch(['stop']).exited;
	assert.equal(result.code, 1);
	assert.match(result.output, /Cannot verify launcher ownership/);
	assert.equal(await readFile(path, 'utf8'), state);
});

test('container leases reject another worktree without stopping its database', async (t) => {
	const first = await fixture(t);
	const server = first.launch(['start']);
	await first.ready(server);
	const second = await fixture(t, { containerId: first.id });
	const refused = await second.launch(['start']).exited;
	assert.equal(refused.code, 1);
	assert.match(refused.output, /reserved by another launcher/);
	assert.equal(await first.database(), 'true');
	assert.equal((await first.launch(['stop']).exited).code, 0);
	await server.exited;
});

test('failed container shutdown retains ownership and returns failure', async (t) => {
	const f = await fixture(t, { stopFails: true });
	const server = f.launch(['start']);
	await f.ready(server);
	server.child.kill('SIGTERM');
	const result = await server.exited;
	assert.equal(result.code, 1);
	assert.match(result.output, /cleanup failed; ownership record retained/);
	assert.equal(await f.database(), 'true');
	assert.equal(
		JSON.parse(await readFile(join(f.root, '.local/dev.pid'), 'utf8')).pid,
		server.child.pid
	);
});

test('both independent children receive their own runtime configuration and stop together', async (t) => {
	const f = await fixture(t, {
		webOrigin: 'http://127.0.0.1:5319',
		apiPort: '5320'
	});
	const server = f.launch(['start']);
	await f.ready(server);
	assert.equal((await f.launch(['stop']).exited).code, 0);
	assert.equal((await server.exited).code, 0);
	const events = (await readFile(join(f.root, 'events'), 'utf8'))
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line));
	const api = events.find((event) => event.event === 'start' && event.name === 'backend');
	const web = events.find((event) => event.event === 'start' && event.name === 'frontend');
	assert.equal(api.host, '127.0.0.1');
	assert.equal(api.port, '5320');
	assert.equal(api.trusted, '127.0.0.1,::1');
	assert.ok(api.database);
	assert.equal(api.bodySizeLimit, undefined);
	assert.equal(web.bodySizeLimit, '12M');
	assert.equal(web.database, undefined);
	assert.equal(web.s3, undefined);
	assert.equal(web.pgPassword, undefined);
	assert.equal(web.api, 'http://127.0.0.1:5320');
	assert.deepEqual(web.args, ['dev', '--host', '127.0.0.1', '--port', '5319', '--strictPort']);
	assert.deepEqual(
		events
			.filter((event) => event.event === 'stop')
			.map((event) => event.name)
			.sort(),
		['backend', 'catalog', 'frontend', 'scan', 'state']
	);
});

test('an API child failure stops its web sibling and releases owned resources', async (t) => {
	const f = await fixture(t, { appFails: true });
	const server = f.launch(['start']);
	const result = await server.exited;
	assert.equal(result.code, 7, result.output);
	const events = (await readFile(join(f.root, 'events'), 'utf8'))
		.trim()
		.split('\n')
		.map((line) => JSON.parse(line));
	assert.ok(events.some((event) => event.name === 'frontend' && event.event === 'stop'));
	assert.equal(await f.database(), 'false');
	assert.equal((await f.launch(['stop']).exited).code, 0);
});

test('a LAN development origin is refused before claiming ownership', async (t) => {
	const f = await fixture(t, { webOrigin: 'http://0.0.0.0:5173' });
	const result = await f.launch(['start']).exited;
	assert.equal(result.code, 1);
	assert.match(result.output, /must use HTTP loopback/);
	assert.equal(await f.database(), 'false');
});

test('the compatibility frontend entry retains verified root launcher shutdown', async (t) => {
	const f = await fixture(t);
	const server = f.launch(['start'], true);
	await f.ready(server);
	assert.equal((await f.launch(['stop'], true).exited).code, 0);
	assert.equal((await server.exited).code, 0);
	assert.equal(await f.database(), 'false');
});

for (const mode of ['argument', 'environment']) {
	test(`the ${mode} demo flag reaches both API and web presentation`, async (t) => {
		const f = await fixture(t, {
			demoMode: mode === 'environment' ? 'true' : 'false'
		});
		const server = f.launch(mode === 'argument' ? ['start', '--demo'] : ['start']);
		await f.ready(server);
		assert.equal((await f.launch(['stop']).exited).code, 0);
		assert.equal((await server.exited).code, 0);
		const starts = (await readFile(join(f.root, 'events'), 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
			.filter((event) => event.event === 'start');
		assert.equal(starts.length, 4);
		assert.equal(
			starts.some((event) => event.name === 'catalog'),
			false
		);
		assert.equal(starts.find((event) => event.name === 'backend').demo, 'true');
		const web = starts.find((event) => event.name === 'frontend');
		assert.equal(web.demo, 'true');
		assert.equal(web.database, undefined);
	});
}

for (const bodySizeLimit of ['24M', '']) {
	test(`web body limit ${bodySizeLimit ? 'preserves an operator override' : 'defaults when empty'}`, async (t) => {
		const f = await fixture(t, { bodySizeLimit });
		const server = f.launch(['start']);
		await f.ready(server);
		assert.equal((await f.launch(['stop']).exited).code, 0);
		assert.equal((await server.exited).code, 0);
		const web = (await readFile(join(f.root, 'events'), 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
			.find((event) => event.event === 'start' && event.name === 'frontend');
		assert.equal(web.bodySizeLimit, bodySizeLimit || '12M');
		assert.equal(web.database, undefined);
		assert.equal(web.s3, undefined);
		assert.equal(web.pgPassword, undefined);
	});
}

for (const [label, options, relative] of [
	['copied environment', { copiedEnv: true }, '.local/catalog'],
	['missing setting', {}, '.local/catalog'],
	['relative override', { copiedEnv: true, workerDataDir: '.local/custom' }, '.local/custom'],
	['absolute override', { copiedEnv: true, workerDataDir: 'absolute' }, '.local/absolute']
]) {
	test(`dev Catalog storage is writable with ${label}`, async (t) => {
		const f = await fixture(t, options);
		const server = f.launch(['start']);
		await f.ready(server);
		server.child.kill('SIGTERM');
		assert.equal((await server.exited).code, 0);
		assert.equal(await readFile(join(f.root, relative, 'probe'), 'utf8'), 'writable');
	});
}

test('successful manual Catalog completion leaves every dev sibling running', async (t) => {
	const f = await fixture(t, { catalogExit: 0 });
	const server = f.launch(['start']);
	await f.ready(server);
	await new Promise((resolve) => setTimeout(resolve, 400));
	const events = (await readFile(join(f.root, 'events'), 'utf8'))
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.ok(events.some((e) => e.event === 'complete' && e.name === 'catalog'));
	assert.equal(server.child.exitCode, null);
	assert.equal(events.filter((e) => e.event === 'stop').length, 0);
	server.child.kill('SIGINT');
	assert.equal((await server.exited).code, 0);
	const final = (await readFile(join(f.root, 'events'), 'utf8')).trim().split('\n').map(JSON.parse);
	assert.deepEqual(
		final
			.filter((e) => e.event === 'stop')
			.map((e) => e.name)
			.sort(),
		['backend', 'frontend', 'scan', 'state']
	);
});

test('Catalog failure stops dev siblings and releases owned resources', async (t) => {
	const f = await fixture(t, { catalogExit: 7 });
	const server = f.launch(['start']);
	assert.equal((await server.exited).code, 7);
	assert.equal(await f.database(), 'false');
	const events = (await readFile(join(f.root, 'events'), 'utf8'))
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.deepEqual(
		events
			.filter((e) => e.event === 'stop')
			.map((e) => e.name)
			.sort(),
		['backend', 'frontend', 'scan', 'state']
	);
});

test('unusable explicit Catalog storage fails startup and releases dev ownership', async (t) => {
	const f = await fixture(t, { workerDataDir: '.env' });
	const result = await f.launch(['start']).exited;
	assert.equal(result.code, 1);
	assert.equal(await f.database(), 'false');
	await assert.rejects(readFile(join(f.root, '.local/dev.pid')), {
		code: 'ENOENT'
	});
});
