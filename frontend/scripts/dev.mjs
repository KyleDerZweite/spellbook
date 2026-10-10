import { execFileSync, spawn } from 'node:child_process';
import { link, mkdir, open, readFile, readlink, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const storage = resolve(root, process.env.SCAN_LOCAL_STORAGE_DIR || '.local/scans');
const args = process.argv.slice(2);
const action = args[0] && !args[0].startsWith('--') ? args.shift() : 'start';
if (!['start', 'stop'].includes(action) || args.some((arg) => !['--scan', '--demo'].includes(arg)))
	throw new Error('Usage: ./dev.sh [start [--demo] [--scan] | stop]');
const statePath = resolve(root, '.local/dev.pid');
const script = fileURLToPath(import.meta.url);
async function identity(pid) {
	try {
		const command = await readFile(`/proc/${pid}/cmdline`, 'utf8');
		const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
		const cwd = await readlink(`/proc/${pid}/cwd`);
		if (!command.split('\0').some((part) => part && resolve(cwd, part) === script)) return null;
		return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
	} catch (error) {
		if (['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) return null;
		throw error;
	}
}
if (action === 'stop') {
	let state;
	try {
		state = JSON.parse(await readFile(statePath, 'utf8'));
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		console.log('Dev server is not running.');
		process.exit(0);
	}
	if ((await identity(state.pid)) !== state.identity || !state.identity)
		throw new Error('Cannot verify launcher ownership. No process was stopped.');
	process.kill(state.pid, 'SIGTERM');
	for (let attempt = 0; attempt < 150; attempt++) {
		try {
			const current = JSON.parse(await readFile(statePath, 'utf8'));
			if (current.pid !== state.pid || current.identity !== state.identity) {
				console.log('Dev server stopped. A new launcher owns the record.');
				process.exit(0);
			}
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
			console.log('Dev server stopped.');
			process.exit(0);
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('Graceful shutdown is still pending. No force termination was used.');
}
const demo = args.includes('--demo');
const scan = args.includes('--scan');

if (Number(process.versions.node.split('.')[0]) !== 26) {
	throw new Error('Use the Node version in frontend/.node-version, or run ./dev.sh.');
}
if (!process.env.DATABASE_URL) {
	throw new Error('Set DATABASE_URL in the root .env. See .env.example.');
}

await mkdir(resolve(root, '.local'), { recursive: true });
const state = JSON.stringify({ pid: process.pid, identity: await identity(process.pid) });
const temporaryState = `${statePath}.${process.pid}.tmp`;
await writeFile(temporaryState, state, { flag: 'wx', mode: 0o600 });
try {
	await link(temporaryState, statePath);
} catch (error) {
	if (error.code !== 'EEXIST') throw error;
	throw new Error(
		'A launcher ownership record already exists. Use ./dev.sh stop; inspect .local/dev.pid after a crash before removing it.'
	);
} finally {
	await unlink(temporaryState);
}
if (scan) await mkdir(storage, { recursive: true });

const env = {
	...process.env,
	...(demo ? { DEMO_MODE: 'true' } : {}),
	APP_ORIGIN: process.env.DEV_APP_ORIGIN?.trim() || 'http://localhost:5173',
	SCAN_STORAGE_DRIVER: 'local',
	SCAN_LOCAL_STORAGE_DIR: storage,
	SCAN_WORKER_URL: 'http://127.0.0.1:8087'
};
const children = new Set();
let stopping = false;
let ownedContainer;
let containerLease;
let cleaned = false;
let preparing = true;
function podman(args) {
	return execFileSync('podman', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}
async function cleanup() {
	if (cleaned || children.size || preparing) return;
	cleaned = true;
	try {
		if (ownedContainer) podman(['stop', '--time', '-1', ownedContainer]);
		if (containerLease) await unlink(containerLease);
		await unlink(statePath);
	} catch (error) {
		process.exitCode = 1;
		console.error('Development cleanup failed; ownership record retained:', error.message);
	}
}

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
	void cleanup();
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
		void cleanup();
	});
	child.on('exit', (code) => {
		stop(code ?? 1);
		children.delete(child);
		void cleanup();
	});
	return child;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
	const container = process.env.DEV_DATABASE_CONTAINER?.trim();
	if (container) {
		const info = JSON.parse(podman(['inspect', container]))[0];
		const leaseDirectory = resolve(homedir(), '.cache/spellbook/dev-containers');
		await mkdir(leaseDirectory, { recursive: true, mode: 0o700 });
		const leasePath = resolve(leaseDirectory, `${info.Id}.pid`);
		let lease;
		try {
			lease = await open(leasePath, 'wx', 0o600);
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;
			throw new Error(
				`Database container is reserved by another launcher. Inspect ${leasePath} after a crash.`
			);
		}
		containerLease = leasePath;
		await lease.writeFile(state);
		await lease.close();
		// Inspect again under the cross-worktree lease before claiming startup.
		if (stopping) throw new Error('Development startup interrupted.');
		const running = JSON.parse(podman(['inspect', info.Id]))[0].State.Running;
		if (!running) {
			podman(['start', info.Id]);
			ownedContainer = info.Id;
		}
		let ready = false;
		for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
			try {
				podman(['exec', info.Id, 'pg_isready']);
				ready = true;
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
		}
		if (!ready) throw new Error('Development database did not become ready.');
	}
	if (demo && !stopping) {
		await new Promise((resolve, reject) => {
			const child = start(process.execPath, ['scripts/demo/seed.mjs'], `${root}frontend`);
			// A successful seed is preparation, not a server exit.
			child.removeAllListeners('exit');
			child.on('exit', (code) => {
				children.delete(child);
				if (code === 0) resolve();
				else reject(new Error('Demo seed failed.'));
			});
			child.on('error', reject);
		});
	}
	if (!stopping) {
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
		start(
			'pnpm',
			['dev', '--host', '0.0.0.0', '--port', '5173', '--strictPort'],
			`${root}frontend`
		);
	}
} catch (error) {
	console.error(error.message);
	stop(1);
}

preparing = false;
if (stopping) await cleanup();
