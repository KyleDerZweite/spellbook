import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const storage = resolve(root, process.env.SCAN_LOCAL_STORAGE_DIR || '.local/scans');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--scan')) throw new Error('Usage: ./dev.sh [--scan]');
const scan = args.includes('--scan');

if (Number(process.versions.node.split('.')[0]) !== 26) {
	throw new Error('Use the Node version in frontend/.node-version, or run ./dev.sh.');
}
if (!process.env.DATABASE_URL) {
	throw new Error('Set DATABASE_URL in the root .env. See .env.example.');
}

if (scan) await mkdir(storage, { recursive: true });

const env = {
	...process.env,
	APP_ORIGIN: process.env.DEV_APP_ORIGIN?.trim() || 'http://localhost:5173',
	SCAN_STORAGE_DRIVER: 'local',
	SCAN_LOCAL_STORAGE_DIR: storage,
	SCAN_WORKER_URL: 'http://127.0.0.1:8087'
};
const children = new Set();
let stopping = false;

function signal(child, name) {
	if (!child.pid) return;
	try {
		if (process.platform === 'win32') child.kill(name);
		else process.kill(-child.pid, name);
	} catch (error) {
		if (error.code !== 'ESRCH') throw error;
	}
}

function stop(code) {
	if (stopping) return;
	stopping = true;
	process.exitCode = code;
	for (const child of children) signal(child, 'SIGTERM');
	const timer = setTimeout(() => {
		for (const child of children) signal(child, 'SIGKILL');
	}, 5000);
	timer.unref();
}

function start(command, args, cwd) {
	const child = spawn(command, args, {
		cwd,
		env,
		stdio: 'inherit',
		detached: process.platform !== 'win32'
	});
	children.add(child);
	child.on('error', (error) => {
		children.delete(child);
		console.error(`Could not start ${command}: ${error.message}`);
		stop(1);
	});
	child.on('exit', (code) => {
		stop(code ?? 1);
		children.delete(child);
	});
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (scan)
	start(
		'uv',
		[
			'run',
			'--no-sync',
			'uvicorn',
			'scan_worker.main:app',
			'--host',
			'127.0.0.1',
			'--port',
			'8087'
		],
		`${root}scan-worker`
	);
start('pnpm', ['dev', '--host', '0.0.0.0', '--port', '5173', '--strictPort'], `${root}frontend`);
