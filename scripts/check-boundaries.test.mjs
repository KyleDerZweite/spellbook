import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkBoundaries } from './check-boundaries.mjs';

function fixture(files, run) {
	const root = mkdtempSync(join(tmpdir(), 'spellbook-boundaries-'));
	try {
		for (const [file, content] of Object.entries(files)) {
			mkdirSync(join(root, file, '..'), { recursive: true });
			writeFileSync(join(root, file), content);
		}
		run(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test('browser rejects backend through alias, type import, re-export and dynamic import', () => {
	for (const code of [
		"import type { Database } from '#backend/db/client.ts';",
		"export type { Database } from '#backend/db/client.ts';",
		"const backend = import('#backend/db/client.ts');",
		'<script lang="ts">import { db } from "#lib/server/db.ts";</script>'
	])
		fixture(
			{
				'frontend/package.json': JSON.stringify({
					name: 'fixture',
					imports: { '#lib/*': './src/lib/*' }
				}),
				'frontend/tsconfig.json': JSON.stringify({
					compilerOptions: { paths: { '#backend/*': ['../backend/src/*'] } }
				}),
				'frontend/src/page.svelte': code.startsWith('<script')
					? code
					: `<script lang="ts">${code}</script>`,
				'frontend/src/lib/server/db.ts': 'export const db = {};',
				'backend/src/db/client.ts': 'export type Database = {};'
			},
			(root) => assert.ok(checkBoundaries(root).some((error) => error.rule === 'browser-server'))
		);
});

test('backend rejects frontend and framework imports including types', () => {
	for (const code of [
		"export * from '../../frontend/src/lib/client.ts';",
		"import type { RequestEvent } from '@sveltejs/kit';"
	])
		fixture({ 'backend/src/index.ts': code, 'frontend/src/lib/client.ts': '' }, (root) => {
			assert.ok(checkBoundaries(root).some((error) => error.rule === 'backend-frontend'));
		});
});

test('contracts reject platform and implementation types', () => {
	for (const code of [
		"import type { Pool } from 'pg';",
		"import type { Buffer } from 'node:buffer';",
		"export * from '../../backend/src/index.ts';"
	])
		fixture({ 'contracts/src/index.ts': code, 'backend/src/index.ts': '' }, (root) => {
			assert.ok(checkBoundaries(root).some((error) => error.rule === 'contracts-safe'));
		});
});

test('server persistence exceptions are exact edges and cannot authorize a new caller', () => {
	fixture(
		{
			'frontend/src/lib/server/old.ts': "import { db } from './db/client.ts';",
			'frontend/src/lib/server/new.ts': "import { db } from './db/client.ts';",
			'frontend/src/lib/server/db/client.ts': 'export const db = {};'
		},
		(root) => {
			const allowlist = [{ file: 'frontend/src/lib/server/old.ts', specifier: './db/client.ts' }];
			const errors = checkBoundaries(root, { legacy: allowlist });
			assert.equal(errors.length, 1);
			assert.equal(errors[0].file, 'frontend/src/lib/server/new.ts');
		}
	);
});

test('browser contracts and named composition imports are allowed', () => {
	fixture(
		{
			'frontend/src/lib/client.ts':
				"import type { AuthUser } from '../../..//contracts/src/auth.ts';",
			'frontend/src/lib/server/composition.ts':
				"import { createDatabase } from '@spellbook/backend';",
			'contracts/src/auth.ts': 'export interface AuthUser { accountId: string; }'
		},
		(root) => assert.deepEqual(checkBoundaries(root), [])
	);
});

test('built client check detects backend code and rejects absent output', async () => {
	const { checkClient } = await import('./check-client.mjs');
	fixture({ 'client/app.js': "const module='node:crypto';" }, (root) => {
		assert.equal(checkClient(join(root, 'client')).length, 1);
		assert.throws(() => checkClient(join(root, 'absent')), /Build client output/);
	});
});

test('public server composition rejects raw database access for a new caller', async () => {
	const { default: ts } = await import('../frontend/node_modules/typescript/lib/typescript.js');
	const composition = new URL('../frontend/src/lib/server/composition.ts', import.meta.url)
		.pathname;
	fixture(
		{
			'new-server.ts': `import { application } from '${composition}';\napplication.db;\napplication.pool;\napplication.catalog;\napplication.auth;`
		},
		(root) => {
			const caller = join(root, 'new-server.ts');
			const program = ts.createProgram([caller], {
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ESNext,
				allowImportingTsExtensions: true,
				noEmit: true,
				skipLibCheck: true,
				strict: true
			});
			const failures = program.getSemanticDiagnostics(program.getSourceFile(caller));
			assert.deepEqual(
				failures.map((failure) => failure.code),
				[2339, 2339]
			);
			assert.match(
				ts.flattenDiagnosticMessageText(failures[0].messageText, '\n'),
				/^Property 'db' does not exist/
			);
			assert.match(
				ts.flattenDiagnosticMessageText(failures[1].messageText, '\n'),
				/^Property 'pool' does not exist/
			);
		}
	);
});
