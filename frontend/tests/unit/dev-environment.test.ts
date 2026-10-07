import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const frontend = new URL('../../', import.meta.url);

async function launch(caller: Record<string, string> = {}, devOrigin?: string) {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-dev-env-'));
	try {
		const app = join(root, 'frontend');
		const bin = join(root, 'bin');
		const log = join(root, 'children.jsonl');
		const storage = join(root, 'scan-artifacts');
		await mkdir(join(app, 'scripts'), { recursive: true });
		await mkdir(bin);
		await mkdir(join(root, 'scan-worker'));
		await writeFile(
			join(app, 'scripts/dev.mjs'),
			await readFile(new URL('scripts/dev.mjs', frontend))
		);
		await writeFile(
			join(root, '.env'),
			[
				'DATABASE_URL=postgres://fixture:fixture@localhost/fixture_design',
				'APP_ORIGIN=https://production.example.test',
				`SCAN_LOCAL_STORAGE_DIR=${storage}`,
				...(devOrigin ? [`DEV_APP_ORIGIN=${devOrigin}`] : [])
			].join('\n')
		);
		const probe = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const keys = ['DATABASE_URL', 'APP_ORIGIN', 'SCAN_LOCAL_STORAGE_DIR', 'SCAN_STORAGE_DRIVER', 'SCAN_WORKER_URL'];
appendFileSync(process.env.DEV_TEST_LOG, JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2), env: Object.fromEntries(keys.map(key => [key, process.env[key]]))}) + '\\n');
setTimeout(() => process.exit(0), 150);
`;
		await Promise.all(
			['uv', 'pnpm'].map((name) => writeFile(join(bin, name), probe, { mode: 0o700 }))
		);
		const manifest = JSON.parse(await readFile(new URL('package.json', frontend), 'utf8'));
		const [command, ...args] = manifest.scripts['dev:local'].split(' ');
		expect(command).toBe('node');
		await execute(process.execPath, args, {
			cwd: app,
			env: { PATH: `${bin}:${process.env.PATH}`, DEV_TEST_LOG: log, ...caller },
			timeout: 5000
		});
		const children = (await readFile(log, 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		return { children, storage, app, scan: join(root, 'scan-worker') };
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('configured local launcher', () => {
	it('loads the single root env and keeps the deployment origin out of local forms', async () => {
		const { children, storage, app, scan } = await launch();
		expect(children).toHaveLength(2);
		expect(children.map((child) => child.cwd).sort()).toEqual([app, scan].sort());
		for (const child of children) {
			expect(child.env).toEqual({
				DATABASE_URL: 'postgres://fixture:fixture@localhost/fixture_design',
				APP_ORIGIN: 'http://localhost:5173',
				SCAN_LOCAL_STORAGE_DIR: storage,
				SCAN_STORAGE_DRIVER: 'local',
				SCAN_WORKER_URL: 'http://127.0.0.1:8087'
			});
		}
	});

	it('honors the configured dev origin and caller overrides without another env file', async () => {
		const configured = await launch({}, 'http://127.0.0.1:5173');
		expect(configured.children.map((child) => child.env.APP_ORIGIN)).toEqual([
			'http://127.0.0.1:5173',
			'http://127.0.0.1:5173'
		]);
		const overridden = await launch(
			{
				DATABASE_URL: 'postgres://caller:caller@localhost/caller_design',
				DEV_APP_ORIGIN: 'http://localhost:5173'
			},
			'http://127.0.0.1:5173'
		);
		for (const child of overridden.children) {
			expect(child.env.DATABASE_URL).toBe('postgres://caller:caller@localhost/caller_design');
			expect(child.env.APP_ORIGIN).toBe('http://localhost:5173');
		}
	});
});
