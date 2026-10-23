import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(t, fail = '') {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-python-start-'));
	for (const directory of [
		'scripts',
		'bin',
		'backend/api',
		'backend/workers/state',
		'backend/workers/catalog',
		'backend/workers/scan'
	])
		await mkdir(join(root, directory), { recursive: true });
	await copyFile(new URL('./python.mjs', import.meta.url), join(root, 'scripts/python.mjs'));
	await writeFile(
		join(root, 'bin/uvx'),
		`#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const record = (event) => appendFileSync(process.env.LOG, JSON.stringify({event,args}) + '\\n');
record('start');
if (args.includes('spellbook-migrate')) process.exit(process.env.FAIL === 'migrate' ? 4 : 0);
if (args.includes('spellbook-api') && process.env.FAIL === 'api') setTimeout(() => process.exit(5), 150);
process.on('SIGTERM', () => { record('stop'); process.exit(0); });
setInterval(() => {}, 1000);
`,
		{ mode: 0o700 }
	);
	const child = spawn(process.execPath, [join(root, 'scripts/python.mjs'), 'start'], {
		env: {
			...process.env,
			PATH: `${join(root, 'bin')}:${process.env.PATH}`,
			LOG: join(root, 'events'),
			FAIL: fail,
			SCAN_WORKER_URL: 'http://127.0.0.1:8080'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout.resume();
	child.stderr.resume();
	const exited = once(child, 'exit');
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGTERM');
			await exited;
		}
		await rm(root, { recursive: true, force: true });
	});
	const events = async () =>
		(await readFile(join(root, 'events'), 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
	return { child, exited, events };
}

test('migration failure prevents every runtime owner from starting', async (t) => {
	const f = await fixture(t, 'migrate');
	assert.equal((await f.exited)[0], 1);
	assert.equal((await f.events()).length, 1);
});

test('API startup failure stops all separately owned workers', async (t) => {
	const f = await fixture(t, 'api');
	assert.equal((await f.exited)[0], 1);
	const events = await f.events();
	assert.equal(events.filter((e) => e.event === 'start').length, 5);
	assert.equal(events.filter((e) => e.event === 'stop').length, 3);
});

test('foreground shutdown signals all four runtime owners after migration', async (t) => {
	const f = await fixture(t);
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if ((await f.events()).length === 5) break;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.equal((await f.events()).length, 5);
	f.child.kill('SIGTERM');
	await f.exited;
	assert.equal((await f.events()).filter((e) => e.event === 'stop').length, 4);
});
