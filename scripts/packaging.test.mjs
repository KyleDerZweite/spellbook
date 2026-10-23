import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = new URL('../', import.meta.url);
const temporaryRoot = fileURLToPath(new URL('.local/', repository));
await mkdir(temporaryRoot, { recursive: true });

test('Compose worker contexts contain independent locked packages and executable image inputs', async () => {
	const compose = await readFile(new URL('podman-compose.yml', repository), 'utf8');
	for (const [service, directory, module] of [
		['worker', 'catalog', 'worker'],
		['scan-worker', 'scan', 'scan_worker']
	]) {
		const context = compose.match(
			new RegExp(`  ${service}:\\n    build:\\n      context: (.+)`)
		)?.[1];
		assert.equal(context, `./backend/workers/${directory}`);
		const root = new URL(`${context}/`, repository);
		const manifest = await readFile(new URL('pyproject.toml', root), 'utf8');
		assert.match(manifest, new RegExp(`packages = \\["src/${module}"\\]`));
		assert.doesNotMatch(manifest, /\[tool\.uv\.workspace\]/);
		assert.ok((await readFile(new URL('uv.lock', root), 'utf8')).includes('version = 1'));
		const image = await readFile(new URL('Dockerfile', root), 'utf8');
		assert.match(image, /COPY pyproject\.toml uv\.lock \.\//);
		assert.match(image, /uv sync --frozen --no-dev --no-editable/);
		assert.ok(image.includes(module === 'worker' ? 'worker.main' : 'scan_worker.main:app'));
		assert.ok((await readFile(new URL(`src/${module}/main.py`, root), 'utf8')).length > 0);
		// A package-root context must supply its own excludes, independently of the root image.
		assert.match(
			await readFile(new URL('.dockerignore', root), 'utf8'),
			/^\*\*\n!pyproject.toml\n!uv.lock\n!src\/\n!src\/\*\*/
		);
	}
	assert.match(compose, /WORKER_DATA_DIR: \/app\/data/);
	assert.match(compose, /worker_data:\/app\/data/);
});

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
