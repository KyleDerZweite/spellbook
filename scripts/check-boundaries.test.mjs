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

test('frontend persistence has no legacy exemptions', () => {
	fixture(
		{
			'frontend/src/lib/server/old.ts': "import { db } from './db/client.ts';",
			'frontend/src/lib/server/db/client.ts': 'export const db = {};',
			'scripts/boundary-policy.json': JSON.stringify({
				legacy: [
					{
						file: 'frontend/src/lib/server/old.ts',
						specifier: './db/client.ts'
					}
				]
			})
		},
		(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-persistence')
	);
});

test('browser contracts and named composition imports are allowed', () => {
	fixture(
		{
			'frontend/src/lib/client.ts':
				"import type { AuthUser } from '../../..//contracts/src/auth.ts';",
			'frontend/src/lib/server/composition.ts':
				"import { createApplication } from '@spellbook/backend/application.ts';",
			'contracts/src/auth.ts': 'export interface AuthUser { accountId: string; }',
			'scripts/boundary-policy.json': JSON.stringify({
				adapters: [
					{
						file: 'frontend/src/lib/server/composition.ts',
						specifier: '@spellbook/backend/application.ts'
					}
				]
			})
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

test('approved composition rejects root factories and implementation imports', () => {
	for (const specifier of [
		'@spellbook/backend',
		'@spellbook/backend/db/client.ts',
		'@spellbook/backend/categories/jobs.ts'
	])
		fixture(
			{
				'frontend/src/lib/server/composition.ts': `export * from '${specifier}';`,
				'scripts/boundary-policy.json': JSON.stringify({
					adapters: [
						{
							file: 'frontend/src/lib/server/composition.ts',
							specifier: '@spellbook/backend/application.ts'
						}
					]
				})
			},
			(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-persistence')
		);
});

test('operator seams are limited to their exact native entries', () => {
	fixture(
		{
			'frontend/scripts/demo/seed.mjs':
				"import { seedDemo } from '@spellbook/backend/operators/demo.ts';",
			'frontend/scripts/other.mjs':
				"import { seedDemo } from '@spellbook/backend/operators/demo.ts';",
			'scripts/boundary-policy.json': JSON.stringify({
				adapters: [
					{
						file: 'frontend/scripts/demo/seed.mjs',
						specifier: '@spellbook/backend/operators/demo.ts'
					}
				]
			})
		},
		(root) => {
			assert.deepEqual(
				checkBoundaries(root).map((error) => error.file),
				['frontend/scripts/other.mjs']
			);
		}
	);
});

test('frontend runtime cannot reach operator scripts through aliases or relative imports', () => {
	for (const specifier of ['../../../scripts/demo/seed.mjs', '#operator/demo/seed.mjs'])
		for (const statement of [
			`import type { Result } from '${specifier}';`,
			`export * from '${specifier}';`,
			`const operator = import('${specifier}');`
		])
			fixture(
				{
					'frontend/package.json': JSON.stringify({
						imports: { '#operator/*': './scripts/*' }
					}),
					'frontend/src/lib/server/bypass.ts': statement,
					'frontend/scripts/demo/seed.mjs': 'export const seedDemo = () => {};'
				},
				(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-operator')
			);
});

test('native operators permit only approved named operations', () => {
	const file = 'frontend/scripts/demo/seed.mjs';
	const specifier = '@spellbook/backend/operators/demo.ts';
	for (const statement of [
		`import { createDemoPool } from '${specifier}';`,
		`import { createDemoPool as seedDemo } from '${specifier}';`,
		`import * as demo from '${specifier}';`,
		`import demo, { seedDemo } from '${specifier}';`,
		`export * from '${specifier}';`,
		`export * as demo from '${specifier}';`,
		`const demo = import('${specifier}');`,
		`import type { Database } from '${specifier}';`,
		"import { seedDemo } from '#operator/demo.ts';"
	])
		fixture(
			{
				[file]: statement,
				'frontend/package.json': JSON.stringify({
					imports: { '#operator/*': '../backend/src/operators/*' }
				}),
				'backend/src/operators/demo.ts': 'export const seedDemo = () => {};',
				'frontend/tsconfig.json': JSON.stringify({
					compilerOptions: { paths: { '#operator/*': ['../backend/src/operators/*'] } }
				}),
				'scripts/boundary-policy.json': JSON.stringify({
					adapters: [{ file, specifier, allowedNames: ['seedDemo'] }]
				})
			},
			(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-persistence')
		);
	for (const statement of [
		`import { seedDemo as seed } from '${specifier}';`,
		`export { seedDemo } from '${specifier}';`
	])
		fixture(
			{
				[file]: statement,
				'scripts/boundary-policy.json': JSON.stringify({
					adapters: [{ file, specifier, allowedNames: ['seedDemo'] }]
				})
			},
			(root) => assert.deepEqual(checkBoundaries(root), [])
		);
});
