import { execFile } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const frontend = new URL('../../', import.meta.url);
const database = 'postgres://fixture:fixture@localhost/fixture_design';

async function launch(
	caller: Record<string, string> = {},
	devOrigin?: string,
	frontendEntry = false
) {
	const root = await mkdtemp(join(tmpdir(), 'spellbook-dev-env-'));
	try {
		const app = join(root, 'frontend');
		const backend = join(root, 'backend/api');
		const bin = join(root, 'bin');
		const log = join(root, 'children.jsonl');
		const storage = join(root, 'scan-artifacts');
		await mkdir(join(app, 'scripts'), { recursive: true });
		await mkdir(join(root, 'scripts'));
		await mkdir(backend, { recursive: true });
		for (const name of ['state', 'catalog'])
			await mkdir(join(root, 'backend/workers', name), { recursive: true });
		await mkdir(bin);
		await mkdir(join(root, 'backend/workers/scan'), { recursive: true });
		await writeFile(
			join(root, 'scripts/dev.mjs'),
			await readFile(new URL('../scripts/dev.mjs', frontend))
		);
		await writeFile(
			join(app, 'scripts/dev.mjs'),
			await readFile(new URL('scripts/dev.mjs', frontend))
		);
		await writeFile(
			join(root, '.env'),
			[
				`DATABASE_URL=${database}`,
				'APP_ORIGIN=https://production.example.test',
				'DEMO_MODE=true',
				'S3_SECRET_ACCESS_KEY=fixture-only-secret',
				'PGPASSWORD=fixture-only-password',
				`SCAN_LOCAL_STORAGE_DIR=${storage}`,
				...(devOrigin ? [`DEV_APP_ORIGIN=${devOrigin}`] : [])
			].join('\n')
		);
		const probe = `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const keys = ['DATABASE_URL', 'APP_ORIGIN', 'DEV_APP_ORIGIN', 'DEMO_MODE', 'S3_SECRET_ACCESS_KEY', 'PGPASSWORD', 'API_HOST', 'API_PORT', 'API_INTERNAL_URL', 'API_TRUSTED_PROXY_ADDRESSES', 'SCAN_LOCAL_STORAGE_DIR', 'SCAN_STORAGE_DRIVER', 'SCAN_WORKER_URL'];
appendFileSync(process.env.DEV_TEST_LOG, JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2), env: Object.fromEntries(keys.map(key => [key, process.env[key]]))}) + '\\n');
if (process.argv.includes('spellbook-migrate') || process.argv.includes('spellbook-demo-seed')) process.exit(0);
const timer = setTimeout(() => process.exit(0), 300);
process.on('SIGTERM', () => { clearTimeout(timer); process.exit(0); });
`;
		await Promise.all(
			['uvx', 'pnpm'].map((name) => writeFile(join(bin, name), probe, { mode: 0o700 }))
		);
		const manifest = JSON.parse(
			await readFile(new URL(frontendEntry ? 'package.json' : '../package.json', frontend), 'utf8')
		);
		const [command, ...args] = manifest.scripts[frontendEntry ? 'dev:local' : 'dev'].split(' ');
		expect(command).toBe('node');
		await execute(process.execPath, args, {
			cwd: frontendEntry ? app : root,
			env: { PATH: `${bin}:${process.env.PATH}`, DEV_TEST_LOG: log, ...caller },
			timeout: 5000,
			killSignal: 'SIGTERM'
		});
		const children = (await readFile(log, 'utf8'))
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line))
			.filter(
				(child) =>
					!child.args.includes('spellbook-migrate') && !child.args.includes('spellbook-demo-seed')
			);
		const storageCreated = await access(storage).then(
			() => true,
			() => false
		);
		expect(
			await access(join(root, '.local/dev.pid')).then(
				() => true,
				() => false
			)
		).toBe(false);
		return {
			children,
			storage,
			storageCreated,
			app,
			backend,
			scan: join(root, 'backend/workers/scan')
		};
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('configured local launcher', () => {
	it('keeps direct Vite development scoped to frontend env and caller origin overrides', async () => {
		const root = await mkdtemp(join(tmpdir(), 'spellbook-direct-env-'));
		try {
			const app = join(root, 'frontend');
			const bin = join(root, 'bin');
			await mkdir(app);
			await mkdir(bin);
			await writeFile(
				join(root, '.env'),
				`DATABASE_URL=${database}\nDEMO_MODE=true\nAPP_ORIGIN=https://production.example.test\nDEV_APP_ORIGIN=http://localhost:5999\n`
			);
			await writeFile(
				join(app, 'vite.config.ts'),
				await readFile(new URL('vite.config.ts', frontend))
			);
			// Evaluate the real config with Vite's native dotenv reader. Plugin factories expose
			// their options without starting SvelteKit, a listener or build analysis.
			const viteModule = new URL('node_modules/vite/dist/node/index.js', frontend).href;
			await writeFile(
				join(bin, 'vite'),
				`#!${process.execPath}
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from ${JSON.stringify(viteModule)};
const modules = {
 'vitest/config': 'export const defineConfig = value => value;',
 '@sveltejs/adapter-node': 'export default () => ({});',
 '@sveltejs/vite-plugin-svelte': 'export const vitePreprocess = () => ({});',
 '@tailwindcss/vite': 'export default () => ({});',
 '@sveltejs/kit/vite': 'export const sveltekit = options => ({name: "fixture-kit", options});'
};
registerHooks({ resolve(specifier, context, next) {
 if (specifier === 'vite') return {url: ${JSON.stringify(viteModule)}, shortCircuit: true};
 if (Object.hasOwn(modules, specifier)) return {url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true};
 return next(specifier, context);
}});
const { default: configure } = await import(pathToFileURL(resolve('vite.config.ts')));
const config = configure({ mode: 'development', command: process.argv[2] === 'build' ? 'build' : 'serve' });
const kit = config.plugins.flat().find(plugin => plugin.name === 'fixture-kit').options;
const loaded = loadEnv('development', config.envDir, '');
console.log(JSON.stringify({args: process.argv.slice(2), envDir: config.envDir, kitEnvDir: kit.env.dir, origin: kit.paths.origin, database: process.env.DATABASE_URL, loadedDatabase: loaded.DATABASE_URL, demo: process.env.DEMO_MODE}));
`,
				{ mode: 0o700 }
			);
			const manifest = JSON.parse(await readFile(new URL('package.json', frontend), 'utf8'));
			const [command, ...args] = manifest.scripts.dev.split(' ');
			expect(command).toBe('vite');
			const direct = async (caller: Record<string, string> = {}, commandArgs = args) => {
				const { stdout } = await execute(join(bin, command), commandArgs, {
					cwd: app,
					env: { PATH: `${bin}:${process.env.PATH}`, ...caller },
					timeout: 5000,
					killSignal: 'SIGTERM'
				});
				return JSON.parse(stdout);
			};
			expect(await direct()).toEqual({
				args: ['dev'],
				envDir: '.',
				kitEnvDir: '.',
				origin: 'http://localhost:5173'
			});
			await writeFile(
				join(app, '.env'),
				'DEV_APP_ORIGIN=http://127.0.0.1:5401\nAPP_ORIGIN=https://web.example.test\n'
			);
			expect(await direct()).toEqual({
				args: ['dev'],
				envDir: '.',
				kitEnvDir: '.',
				origin: 'http://127.0.0.1:5401'
			});
			expect((await direct({ DEV_APP_ORIGIN: ' http://localhost:5402 ' })).origin).toBe(
				'http://localhost:5402'
			);
			expect(
				(await direct({ APP_ORIGIN: ' https://caller.example.test ' }, ['build'])).origin
			).toBe('https://caller.example.test');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('loads the single root env into API and keeps deployment origin and secrets out of web', async () => {
		const { children, storage, storageCreated, app, backend } = await launch();
		expect(children).toHaveLength(5);
		expect(children.map((child) => child.cwd)).toEqual(expect.arrayContaining([app, backend]));
		expect(storageCreated).toBe(true);
		const api = children.find((child) => child.cwd === backend);
		const web = children.find((child) => child.cwd === app);
		expect(api.args).toEqual(['--from', 'uv==0.12.23', 'uv', 'run', '--no-sync', 'spellbook-api']);
		expect(api.env).toEqual({
			DATABASE_URL: database,
			APP_ORIGIN: 'http://localhost:5173',
			DEV_APP_ORIGIN: 'http://localhost:5173',
			DEMO_MODE: 'true',
			S3_SECRET_ACCESS_KEY: 'fixture-only-secret',
			PGPASSWORD: 'fixture-only-password',
			API_HOST: '127.0.0.1',
			API_PORT: '3001',
			API_INTERNAL_URL: 'http://127.0.0.1:3001',
			API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1,::1',
			SCAN_LOCAL_STORAGE_DIR: storage,
			SCAN_STORAGE_DRIVER: 'local',
			SCAN_WORKER_URL: 'http://127.0.0.1:8087'
		});
		expect(web.args).toEqual(['dev', '--host', 'localhost', '--port', '5173', '--strictPort']);
		expect(web.env).toEqual({
			APP_ORIGIN: 'http://localhost:5173',
			DEV_APP_ORIGIN: 'http://localhost:5173',
			DEMO_MODE: 'true',
			API_HOST: '127.0.0.1',
			API_PORT: '3001',
			API_INTERNAL_URL: 'http://127.0.0.1:3001',
			API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1,::1'
		});
	});

	it('starts Scan and creates its storage without an opt-in flag', async () => {
		const { children, storage, storageCreated, app, backend, scan } = await launch();
		expect(children).toHaveLength(5);
		expect(children.map((child) => child.cwd)).toEqual(
			expect.arrayContaining([app, backend, scan])
		);
		expect(children.find((child) => child.cwd === scan).args).toEqual([
			'--from',
			'uv==0.12.23',
			'uv',
			'run',
			'--no-sync',
			'uvicorn',
			'scan_worker.main:app',
			'--host',
			'127.0.0.1',
			'--port',
			'8087'
		]);
		expect(children.find((child) => child.cwd === backend).env.SCAN_LOCAL_STORAGE_DIR).toBe(
			storage
		);
		expect(children.find((child) => child.cwd === app).env.SCAN_LOCAL_STORAGE_DIR).toBeUndefined();
		expect(storageCreated).toBe(true);
	});

	it('honors configured dev origin and caller overrides through the frontend entry', async () => {
		const configured = await launch({}, 'http://127.0.0.1:5173');
		expect(
			configured.children.every((child) => child.env.APP_ORIGIN === 'http://127.0.0.1:5173')
		).toBe(true);
		const overridden = await launch(
			{
				DATABASE_URL: 'postgres://caller:caller@localhost/caller_design',
				DEV_APP_ORIGIN: 'http://localhost:5403',
				API_PORT: '5404',
				DEMO_MODE: 'false'
			},
			'http://127.0.0.1:5173',
			true
		);
		for (const child of overridden.children) {
			expect(child.env.APP_ORIGIN).toBe('http://localhost:5403');
			expect(child.env.DEV_APP_ORIGIN).toBe('http://localhost:5403');
			expect(child.env.DEMO_MODE).toBe('false');
		}
		const api = overridden.children.find((child) => child.cwd === overridden.backend);
		const web = overridden.children.find((child) => child.cwd === overridden.app);
		expect(api.env.DATABASE_URL).toBe('postgres://caller:caller@localhost/caller_design');
		expect(web.env.DATABASE_URL).toBeUndefined();
		expect(web.env.API_INTERNAL_URL).toBe('http://127.0.0.1:5404');
		expect(web.args).toEqual(['dev', '--host', 'localhost', '--port', '5403', '--strictPort']);
	});
});
