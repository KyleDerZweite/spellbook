import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { buildOptions } from './build.mjs';

let child;
let stopping = false;
let restart = Promise.resolve();
const expectedExits = new WeakSet();

async function stopChild() {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child, 'exit');
	expectedExits.add(child);
	child.kill('SIGTERM');
	await exited;
}

const builder = await context({
	...buildOptions,
	plugins: [
		{
			name: 'restart-api',
			setup(build) {
				build.onEnd((result) => {
					restart = restart.then(async () => {
						await stopChild();
						if (stopping || result.errors.length) return;
						child = spawn(process.execPath, ['dist/main.js'], {
							cwd: buildOptions.absWorkingDir,
							env: process.env,
							stdio: 'inherit'
						});
						child.on('error', (error) => {
							console.error(error.message);
							void stop(1);
						});
						const launched = child;
						child.on('exit', (code) => {
							if (!stopping && !expectedExits.has(launched)) void stop(code || 1);
						});
					});
					return restart;
				});
			}
		}
	]
});

async function stop(code) {
	if (stopping) return;
	stopping = true;
	process.exitCode = code;
	await builder.dispose();
	await restart;
	await stopChild();
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));
await builder.watch();
