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

test('frontend SSR rejects backend even when an old adapter policy allows it', () => {
	fixture(
		{
			'frontend/src/lib/server/composition.ts':
				"import { createApplication } from '@spellbook/backend/application.ts';",
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

test('frontend and backend can both import pure contracts', () => {
	fixture(
		{
			'frontend/src/lib/server/remote.ts':
				"import type { AuthUser } from '../../../../contracts/src/auth.ts';",
			'backend/src/auth.ts': "import type { AuthUser } from '../../contracts/src/auth.ts';",
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

test('frontend server rejects persistence through aliases, type imports, dynamic imports and require', () => {
	for (const statement of [
		"import type { Pool } from 'pg';",
		"const db = require('drizzle-orm');",
		"const db = import('@spellbook/backend/db/client.ts');",
		"export * from '#db/schema.ts';"
	])
		fixture(
			{
				'frontend/src/lib/server/runtime.ts': statement,
				'frontend/tsconfig.json': JSON.stringify({
					compilerOptions: { paths: { '#db/*': ['../backend/src/db/*'] } }
				}),
				'backend/src/db/schema.ts': 'export const schema = {};'
			},
			(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-persistence')
		);
});

test('frontend integration fixtures may import backend without admitting runtime tests', () => {
	fixture(
		{
			'frontend/tests/integration/fixture.ts':
				"import { createDatabase } from '@spellbook/backend/db/client.ts';",
			'frontend/src/lib/server/runtime.test.ts':
				"import { createDatabase } from '@spellbook/backend/db/client.ts';"
		},
		(root) =>
			assert.deepEqual(
				checkBoundaries(root).map((error) => error.file),
				['frontend/src/lib/server/runtime.test.ts']
			)
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

test('frontend runtime cannot bypass the API through test fixtures', () => {
	for (const statement of [
		"import '../../../tests/integration/fixture.ts';",
		"export * from '../../../tests/integration/fixture.ts';",
		"const fixture=import('../../../tests/integration/fixture.ts');"
	])
		fixture(
			{
				'frontend/src/lib/server/runtime.ts': statement,
				'frontend/tests/integration/fixture.ts':
					"import {createDatabase} from '@spellbook/backend/db/client.ts';"
			},
			(root) => assert.equal(checkBoundaries(root)[0].rule, 'frontend-test')
		);
});

test('contracts cannot import repository scripts and backend cannot import the frontend package', () => {
	fixture(
		{
			'contracts/src/index.ts': "export * from '../../scripts/helper.mjs';",
			'scripts/helper.mjs': 'export const pool={};',
			'backend/src/main.ts': "import type {Page} from 'spellbook-frontend';"
		},
		(root) =>
			assert.deepEqual(
				checkBoundaries(root).map((error) => error.rule),
				['backend-frontend', 'contracts-safe']
			)
	);
});

test('derived calculations reject workspace subscriptions, including imported aliases', () => {
	for (const expression of [
		'$derived(workspaceSavedState.subscribe(() => descriptor))',
		'$derived.by(() => { return workspaceSavedState.subscribe(() => descriptor); })',
		'$derived.by(() => saved.subscribe(() => descriptor))'
	])
		fixture(
			{
				'frontend/package.json': JSON.stringify({
					imports: { '#lib/*': './src/lib/*' }
				}),
				'frontend/src/lib/saved-state/workspace.svelte.ts': '',
				'frontend/src/page.svelte': `<script lang="ts">
import { workspaceSavedState, workspaceSavedState as saved } from '#lib/saved-state/workspace.svelte.ts';
const result = ${expression};
</script>`
			},
			(root) => {
				const errors = checkBoundaries(root);
				assert.equal(errors.length, 1);
				assert.equal(errors[0].rule, 'derived-workspace-subscription');
				assert.match(errors[0].message, /state_unsafe_mutation/);
				assert.match(errors[0].message, /frontend\/src\/page.svelte:\d+:\d+/);
			}
		);
});

test('initialization, effects, read-only derived state and deferred callbacks remain valid', () => {
	fixture(
		{
			'frontend/package.json': JSON.stringify({
				imports: { '#lib/*': './src/lib/*' }
			}),
			'frontend/src/lib/saved-state/workspace.svelte.ts': '',
			'frontend/src/page.svelte': `<script lang="ts">
import { workspaceSavedState } from '#lib/saved-state/workspace.svelte.ts';
const subscription = workspaceSavedState.subscribe(() => descriptor);
$effect(() => workspaceSavedState.subscribe(() => descriptor));
const state = $derived(subscription.getState());
const read = $derived.by(() => subscription.getState());
const deferred = $derived(() => workspaceSavedState.subscribe(() => descriptor));
const nested = $derived.by(() => () => workspaceSavedState.subscribe(() => descriptor));
// $derived(workspaceSavedState.subscribe(() => descriptor))
const text = '$derived(workspaceSavedState.subscribe())';
</script>`
		},
		(root) => assert.deepEqual(checkBoundaries(root), [])
	);
});
