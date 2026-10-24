import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const result = spawnSync(
	process.execPath,
	[
		fileURLToPath(new URL('../../../scripts/python.mjs', import.meta.url)),
		'demo',
		...process.argv.slice(2)
	],
	{ stdio: 'inherit', env: process.env }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
