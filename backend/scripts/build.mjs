import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Bundle workspace TypeScript, including syntax that Node's type stripping cannot run.
// Database and storage packages keep their native Node module resolution.
export const buildOptions = {
	absWorkingDir: root,
	entryPoints: ['src/main.ts'],
	outfile: 'dist/main.js',
	bundle: true,
	platform: 'node',
	target: 'node26',
	format: 'esm',
	sourcemap: true,
	external: Object.keys(manifest.dependencies).filter((name) => name !== '@spellbook/contracts'),
	logLevel: 'info'
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	await build(buildOptions);
