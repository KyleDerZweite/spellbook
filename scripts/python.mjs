import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [action, ...args] = process.argv.slice(2);
const packages = {
	core: 'spellbook-core',
	api: 'spellbook-api',
	'workers/state': 'spellbook-state-worker',
	'workers/catalog': 'spellbook-worker',
	'workers/scan': 'spellbook-scan-worker'
};
const commands = {
	migrate: 'spellbook-migrate',
	password: 'spellbook-operator-password',
	demo: 'spellbook-demo-seed',
	'replace-inventory': 'spellbook-demo-replace-inventory'
};
const children = new Set();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
	process.on(signal, () => {
		stopping = true;
		for (const child of children) child.kill(signal);
	});
function run(directory, commandArgs) {
	if (stopping) throw new Error('Python startup interrupted.');
	return new Promise((resolve, reject) => {
		const child = spawn('uvx', ['--from', 'uv==0.12.23', 'uv', ...commandArgs], {
			cwd: `${root}backend/${directory}`,
			env: process.env,
			stdio: 'inherit'
		});
		children.add(child);
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			children.delete(child);
			if (code === 0) resolve();
			else reject(new Error(`Python ${directory} exited ${signal || code}.`));
		});
	});
}
function refresh(directory) {
	const project = packages[directory];
	return run(directory, [
		'sync',
		'--frozen',
		'--extra',
		'dev',
		'--python',
		'3.14.8',
		'--no-editable',
		'--reinstall-package',
		project,
		...(['api', 'workers/state'].includes(directory)
			? ['--reinstall-package', 'spellbook-core']
			: [])
	]);
}
try {
	if (action === 'sync') {
		for (const directory of Object.keys(packages)) await refresh(directory);
	} else if (action === 'test') {
		const [directory, ...pytestArgs] = args;
		if (!Object.hasOwn(packages, directory))
			throw new Error(
				'Usage: python.mjs test <' + Object.keys(packages).join('|') + '> [...pytestArgs]'
			);
		await refresh(directory);
		await run(directory, ['run', '--no-sync', 'pytest', ...pytestArgs]);
	} else if (action === 'start') {
		process.env.WORKER_DATA_DIR = resolve(root, process.env.WORKER_DATA_DIR || '.local/catalog');
		await mkdir(process.env.WORKER_DATA_DIR, { recursive: true });
		process.env.SCAN_WORKER_URL ||= 'http://127.0.0.1:8080';
		const scanAddress = new URL(process.env.SCAN_WORKER_URL);
		if (!['127.0.0.1', 'localhost', '[::1]'].includes(scanAddress.hostname))
			throw new Error(
				'Local start requires a loopback SCAN_WORKER_URL. Use independent services for a remote worker.'
			);
		await run('api', ['run', '--no-sync', 'spellbook-migrate']);
		await Promise.all([
			run('api', ['run', '--no-sync', 'spellbook-api']),
			run('workers/state', ['run', '--no-sync', 'spellbook-state-worker']),
			run('workers/catalog', ['run', '--no-sync', 'python', '-m', 'worker.main']),
			run('workers/scan', [
				'run',
				'--no-sync',
				'uvicorn',
				'scan_worker.main:app',
				'--host',
				scanAddress.hostname === '[::1]' ? '::1' : scanAddress.hostname,
				'--port',
				scanAddress.port || '80'
			])
		]);
	} else if (Object.hasOwn(commands, action)) {
		await run('api', ['run', '--no-sync', commands[action], ...args]);
	} else
		throw new Error(
			'Usage: python.mjs sync|test <package> [...pytestArgs]|start|migrate|password|demo|replace-inventory'
		);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
	for (const child of children) child.kill('SIGTERM');
}
