import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(
	process.execPath,
	[fileURLToPath(new URL('../../scripts/dev.mjs', import.meta.url)), ...process.argv.slice(2)],
	{ stdio: 'inherit', env: process.env }
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on('exit', (code) => {
	process.exitCode = code ?? 1;
});
