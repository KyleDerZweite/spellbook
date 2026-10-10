import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(
	t,
	{ running = false, seedFails = false, stopFails = false, containerId } = {}
) {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-dev-'));
	const id = containerId || root.split('/').at(-1);
	await mkdir(join(root, 'frontend/scripts/demo'), { recursive: true });
	await mkdir(join(root, 'bin'));
	await copyFile(new URL('./dev.mjs', import.meta.url), join(root, 'frontend/scripts/dev.mjs'));
	await writeFile(
		join(root, 'frontend/scripts/demo/seed.mjs'),
		`process.exit(${seedFails ? 1 : 0});`
	);
	await writeFile(join(root, 'database'), String(running));
	const executables = {
		pnpm: `console.log('fixture ready'); setInterval(() => {}, 1000); process.on('SIGTERM', () => process.exit(0));`,
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
	function launch(args) {
		const child = spawn(process.execPath, [join(root, 'frontend/scripts/dev.mjs'), ...args], {
			cwd: join(root, 'frontend'),
			env: {
				...process.env,
				PATH: `${join(root, 'bin')}:${process.env.PATH}`,
				DATABASE_URL: 'postgres://localhost/spellbook_demo',
				DEV_DATABASE_CONTAINER: 'fixture',
				FIXTURE_ROOT: root,
				FIXTURE_ID: id,
				FIXTURE_STOP_FAIL: String(stopFails)
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
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
			if (server.output().includes('fixture ready')) return;
			if (server.child.exitCode !== null) throw new Error(server.output());
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		throw new Error(`Launcher did not become ready: ${server.output()}`);
	}
	return { root, id, launch, ready, database: () => readFile(join(root, 'database'), 'utf8') };
}

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
