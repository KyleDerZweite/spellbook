import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(
	t,
	fail = '',
	{
		copiedEnv = false,
		workerDataDir,
		catalogExit,
		operator,
		args = [],
		input = '',
		operatorExit = 0
	} = {}
) {
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
	await copyFile(new URL('../.env.example', import.meta.url), join(root, '.env'));
	await mkdir(join(root, 'frontend'), { recursive: true });
	await copyFile(new URL('./python.mjs', import.meta.url), join(root, 'scripts/python.mjs'));
	await writeFile(
		join(root, 'bin/uvx'),
		`#!${process.execPath}
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const record = (event) => appendFileSync(process.env.LOG, JSON.stringify({event,args,workerDataDir:process.env.WORKER_DATA_DIR}) + '\\n');
record('start');
if (process.env.OPERATOR) {
 appendFileSync(process.env.LOG, JSON.stringify({event:'operator',input:readFileSync(0,'utf8'),cwd:process.cwd()}) + '\\n');
 process.exit(Number(process.env.OPERATOR_EXIT));
}
if (args.includes('worker.main')) {
 writeFileSync(process.env.WORKER_DATA_DIR + '/probe', 'writable');
 if (process.env.SYNC_INTERVAL === 'manual' && process.env.CATALOG_EXIT) setTimeout(() => {record('complete'); process.exit(Number(process.env.CATALOG_EXIT));},150);
}
if (args.includes('spellbook-migrate')) process.exit(process.env.FAIL === 'migrate' ? 4 : 0);
if (args.includes('spellbook-api') && process.env.FAIL === 'api') setTimeout(() => process.exit(5), 150);
process.on('SIGTERM', () => { record('stop'); process.exit(0); });
setInterval(() => {}, 1000);
`,
		{ mode: 0o700 }
	);
	const child = spawn(
		process.execPath,
		[
			...(copiedEnv ? ['--env-file=' + join(root, '.env')] : []),
			join(root, 'scripts/python.mjs'),
			operator || 'start',
			...args
		],
		{
			cwd: join(root, 'frontend'),
			env: {
				...process.env,
				PATH: `${join(root, 'bin')}:${process.env.PATH}`,
				LOG: join(root, 'events'),
				FAIL: fail,
				OPERATOR: operator || '',
				OPERATOR_EXIT: String(operatorExit),
				WORKER_DATA_DIR:
					workerDataDir === 'absolute' ? join(root, '.local/absolute') : workerDataDir,
				SYNC_INTERVAL: catalogExit === undefined ? 'daily' : 'manual',
				CATALOG_EXIT: catalogExit === undefined ? '' : String(catalogExit),
				SCAN_WORKER_URL: 'http://127.0.0.1:8080'
			},
			stdio: [operator ? 'pipe' : 'ignore', 'pipe', 'pipe']
		}
	);
	if (operator) child.stdin.end(input);
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
	return { root, child, exited, events };
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

async function ready(f) {
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			if ((await f.events()).filter((e) => e.event === 'start').length === 5) return;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('Runtime owners did not start');
}

for (const [label, options, relative] of [
	['copied environment', { copiedEnv: true }, '.local/catalog'],
	['missing setting', {}, '.local/catalog'],
	['relative override', { copiedEnv: true, workerDataDir: '.local/custom' }, '.local/custom'],
	['absolute override', { copiedEnv: true, workerDataDir: 'absolute' }, '.local/absolute']
]) {
	test(`native start Catalog storage is writable with ${label}`, async (t) => {
		const f = await fixture(t, '', options);
		await ready(f);
		f.child.kill('SIGTERM');
		await f.exited;
		assert.equal(await readFile(join(f.root, relative, 'probe'), 'utf8'), 'writable');
		const catalog = (await f.events()).find((e) => e.args.includes('worker.main'));
		assert.equal(catalog.workerDataDir, join(f.root, relative));
	});
}

test('successful manual Catalog completion leaves native start siblings running', async (t) => {
	const f = await fixture(t, '', { catalogExit: 0 });
	await ready(f);
	await new Promise((resolve) => setTimeout(resolve, 400));
	assert.ok((await f.events()).some((e) => e.event === 'complete'));
	assert.equal(f.child.exitCode, null);
	assert.equal((await f.events()).filter((e) => e.event === 'stop').length, 0);
	f.child.kill('SIGTERM');
	await f.exited;
	assert.equal((await f.events()).filter((e) => e.event === 'stop').length, 3);
});

test('Catalog failure stops native start siblings', async (t) => {
	const f = await fixture(t, '', { catalogExit: 7 });
	assert.equal((await f.exited)[0], 1);
	assert.equal((await f.events()).filter((e) => e.event === 'stop').length, 3);
});

for (const [operator, command] of [
	['migrate', 'spellbook-migrate'],
	['password', 'spellbook-operator-password'],
	['demo', 'spellbook-demo-seed'],
	['replace-inventory', 'spellbook-demo-replace-inventory']
]) {
	test(`root ${operator} forwards arguments and stdin to the installed command`, async (t) => {
		const args = ['--help', '--fixtures-dir', '/tmp/fixture directory'];
		const input = 'synthetic operator input\n';
		const f = await fixture(t, '', { operator, args, input });
		assert.equal((await f.exited)[0], 0);
		const events = await f.events();
		assert.deepEqual(events[0].args, [
			'--from',
			'uv==0.12.23',
			'uv',
			'run',
			'--no-sync',
			command,
			...args
		]);
		assert.equal(events[1].input, input);
		assert.equal(events[1].cwd, join(f.root, 'backend/api'));
	});
}

test('root operator failure returns a failing exit status', async (t) => {
	const f = await fixture(t, '', { operator: 'password', operatorExit: 7 });
	assert.equal((await f.exited)[0], 1);
});

test('unusable explicit Catalog storage prevents native runtime startup', async (t) => {
	const f = await fixture(t, '', { workerDataDir: '.env' });
	assert.equal((await f.exited)[0], 1);
	await assert.rejects(readFile(join(f.root, 'events')), { code: 'ENOENT' });
});
