import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { buildOptions } from './build.mjs';

test('production bundling transforms existing backend syntax and bundles contracts', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'spellbook-api-build-'));
	try {
		const application = fileURLToPath(new URL('../src/application.ts', import.meta.url));
		const errors = fileURLToPath(new URL('../src/categories/errors.ts', import.meta.url));
		const entry = join(directory, 'entry.ts');
		const outfile = join(directory, 'api.mjs');
		await writeFile(
			entry,
			`import {createApplication} from ${JSON.stringify(application)};
import {CategoryConflict} from ${JSON.stringify(errors)};
const failure = new CategoryConflict({revision:'23'} as never);
console.log(JSON.stringify({factory:typeof createApplication, latest:failure.latest}));`
		);
		const result = await build({
			...buildOptions,
			entryPoints: [entry],
			outfile,
			metafile: true,
			logLevel: 'silent'
		});
		// External packages resolve from this workspace for the disposable artifact.
		const executable = join(buildOptions.absWorkingDir, 'node_modules');
		const { symlink } = await import('node:fs/promises');
		await symlink(executable, join(directory, 'node_modules'), 'dir');
		assert.deepEqual(JSON.parse(execFileSync(process.execPath, [outfile], { encoding: 'utf8' })), {
			factory: 'function',
			latest: { revision: '23' }
		});
		const imports = Object.values(result.metafile.outputs).find(
			(value) => value.entryPoint
		).imports;
		assert.equal(
			imports.some((value) => /spellbook\/contracts|svelte|frontend/.test(value.path)),
			false
		);
		assert.ok(imports.some((value) => value.path === 'pg'));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
