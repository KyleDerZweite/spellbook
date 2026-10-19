import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = new URL('../', import.meta.url);
const temporaryRoot = fileURLToPath(new URL('.local/', repository));
await mkdir(temporaryRoot, { recursive: true });

test('production web installs independently without backend or persistence packages', async () => {
	const root = await mkdtemp(join(temporaryRoot, 'spellbook-web-install-'));
	try {
		for (const file of [
			'package.json',
			'pnpm-lock.yaml',
			'pnpm-workspace.yaml',
			'frontend/package.json',
			'contracts/package.json'
		]) {
			await mkdir(join(root, file, '..'), { recursive: true });
			await cp(new URL(file, repository), join(root, file));
		}
		execFileSync(
			'pnpm',
			['install', '--prod', '--offline', '--frozen-lockfile', '--filter', 'spellbook-frontend...'],
			{
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		const installed = await readdir(join(root, 'node_modules/.pnpm'));
		assert.deepEqual(
			installed.filter((name) => /^(pg@|pg-pool@|drizzle-|@aws-sdk\+|bcrypt|argon2)/.test(name)),
			[]
		);
		const manifest = JSON.parse(await readFile(join(root, 'frontend/package.json'), 'utf8'));
		assert.equal('@spellbook/backend' in manifest.dependencies, false);
		assert.ok(installed.some((name) => name.startsWith('qrcode@')));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('production API installs without SvelteKit and keeps database and storage drivers', async () => {
	const root = await mkdtemp(join(temporaryRoot, 'spellbook-api-install-'));
	try {
		for (const file of [
			'package.json',
			'pnpm-lock.yaml',
			'pnpm-workspace.yaml',
			'backend/package.json',
			'contracts/package.json'
		]) {
			await mkdir(join(root, file, '..'), { recursive: true });
			await cp(new URL(file, repository), join(root, file));
		}
		execFileSync(
			'pnpm',
			['install', '--prod', '--offline', '--frozen-lockfile', '--filter', '@spellbook/backend...'],
			{
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		const installed = await readdir(join(root, 'node_modules/.pnpm'));
		assert.equal(
			installed.some((name) => /svelte|vite|drizzle-kit|esbuild/.test(name)),
			false
		);
		assert.ok(installed.some((name) => name.startsWith('pg@')));
		assert.ok(installed.some((name) => name.startsWith('drizzle-orm@')));
		assert.ok(installed.some((name) => name.startsWith('@aws-sdk+client-s3@')));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
