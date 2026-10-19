import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-api-dev-'));
	await mkdir(join(root, 'scripts'));
	await mkdir(join(root, 'src'));
	for (const file of ['build.mjs', 'dev.mjs'])
		await copyFile(new URL(file, import.meta.url), join(root, 'scripts', file));
	await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies: {} }));
	await symlink(
		fileURLToPath(new URL('../node_modules', import.meta.url)),
		join(root, 'node_modules'),
		'dir'
	);
	let child;
	t.after(async () => {
		if (child && child.exitCode === null && child.signalCode === null) {
			child.kill('SIGTERM');
			await once(child, 'exit');
		}
		await rm(root, { recursive: true, force: true });
	});
	const events = async () => {
		try {
			return await readFile(join(root, 'events'), 'utf8');
		} catch (error) {
			if (error.code === 'ENOENT') return '';
			throw error;
		}
	};
	async function source(version, crash = false) {
		await writeFile(
			join(root, 'src/main.ts'),
			`import {appendFileSync} from 'node:fs';
const record = (message: string) => appendFileSync('events',message+'\\n');
class Marker { constructor(readonly version: string) {} }
const marker = new Marker(${JSON.stringify(version)});
record('start:'+marker.version);
setInterval(()=>{},1000);
${crash ? 'setTimeout(()=>process.exit(7),100);' : ''}
process.on('SIGTERM',()=>{record('stop:'+marker.version);process.exit(0);});`
		);
	}
	function start() {
		child = spawn(process.execPath, ['scripts/dev.mjs'], {
			cwd: root,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.on('data', (chunk) => (output += chunk));
		return { child, exited: once(child, 'exit').then(([code]) => ({ code, output })) };
	}
	async function waitFor(marker) {
		for (let attempt = 0; attempt < 200; attempt++) {
			if ((await events()).includes(marker)) return;
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		assert.fail('API dev fixture did not record ' + marker);
	}
	return { source, start, waitFor, events };
}

test('API watch rebuilds transformed TypeScript and gracefully replaces only its child', async (t) => {
	const f = await fixture(t);
	await f.source('one');
	const server = f.start();
	await f.waitFor('start:one');
	await f.source('two');
	await f.waitFor('start:two');
	server.child.kill('SIGTERM');
	assert.equal((await server.exited).code, 0);
	assert.deepEqual((await f.events()).trim().split('\n'), [
		'start:one',
		'stop:one',
		'start:two',
		'stop:two'
	]);
});

test('an unexpected API exit releases the watcher and returns its failure', async (t) => {
	const f = await fixture(t);
	await f.source('crash', true);
	const result = await f.start().exited;
	assert.equal(result.code, 7, result.output);
});
