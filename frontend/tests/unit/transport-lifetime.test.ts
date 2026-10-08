import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { AuthError } from '@spellbook/backend/auth/local.ts';
import { ValidationError } from '@spellbook/backend/mtg/validation.ts';
import { CategoryConflict } from '@spellbook/backend/categories/application.ts';

it('transport preserves existing exception identity', async () => {
	const transport = await import('@spellbook/backend/transport.ts');
	expect(transport.AuthError).toBe(AuthError);
	expect(transport.ValidationError).toBe(ValidationError);
	expect(transport.CategoryConflict).toBe(CategoryConflict);
	expect(Object.keys(transport).some((name) => name.startsWith('create'))).toBe(false);
	expect(transport).not.toHaveProperty('db');
	expect(transport).not.toHaveProperty('pool');
});

it('fresh transport import requires no database configuration and starts no resources', () => {
	const result = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`
  import pg from 'pg';
  import ts from 'typescript';
  import { registerHooks } from 'node:module';
  registerHooks({ load(url, context, nextLoad) {
   const loaded = nextLoad(url, context);
   if (!url.endsWith('.ts')) return loaded;
   return { ...loaded, format: 'module', source: ts.transpileModule(String(loaded.source), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
   }).outputText };
  } });
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
  pg.Pool = class { constructor() { throw Error('Unexpected pool'); } };
  pg.Client = class { constructor() { throw Error('Unexpected listener'); } };
  globalThis.setTimeout = () => { throw Error('Unexpected timeout'); };
  globalThis.setInterval = () => { throw Error('Unexpected interval'); };
  const transport = await import('@spellbook/backend/transport.ts');
  if (!transport.hashPassword || !transport.ValidationError) throw Error('Missing helpers');
 `
		],
		{ cwd: new URL('../../', import.meta.url), encoding: 'utf8' }
	);
	expect(result.stderr).toBe('');
	expect(result.status).toBe(0);
});
