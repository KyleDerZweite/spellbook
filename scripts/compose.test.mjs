import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostedPlan } from './compose.mjs';
import { developmentPlan } from './dev.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = 'fdb40bd8bc111335cfd5b37ee86758bd27ac8ad9';
const fixture = {
	PROD_INGRESS_NETWORK: 'spellbook-prod-ingress',
	PROD_PANGOLIN_ENDPOINT: 'https://gateway.example.test',
	PROD_NEWT_ID: 'fixture-site',
	PROD_NEWT_SECRET: 'fixture-only',
	DEMO_APP_ORIGIN: 'https://demo.example.test',
	DEMO_POSTGRES_PASSWORD: 'fixture-only',
	DEMO_FRONTEND_ALIAS: 'spellbook-demo-web',
	DEMO_IMAGE_REVISION: sha,
	PROD_APP_ORIGIN: 'https://production.example.test',
	PROD_POSTGRES_PASSWORD: 'fixture-only',
	PROD_FRONTEND_ALIAS: 'spellbook-production-web',
	PROD_IMAGE_REVISION: sha
};
const cleanEnv = { PATH: process.env.PATH, HOME: process.env.HOME };

function config(args, env) {
	const directory = mkdtempSync(join(tmpdir(), 'spellbook-compose-'));
	try {
		for (const file of ['compose.yml', 'compose.dev.yml', 'compose.prod.yml'])
			cpSync(join(root, file), join(directory, file));
		const result = spawnSync('podman-compose', args, {
			cwd: directory,
			env: { ...cleanEnv, ...env },
			encoding: 'utf8'
		});
		assert.equal(result.status, 0, result.stderr);
		const parsed = spawnSync(
			'python3',
			['-c', 'import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin)))'],
			{ input: result.stdout, encoding: 'utf8' }
		);
		assert.equal(parsed.status, 0, parsed.stderr);
		return JSON.parse(parsed.stdout);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

function noPorts(model) {
	assert.ok(Object.values(model.services).every((service) => !service.ports?.length));
}

// Native config tests require podman-compose and Python PyYAML, but never start a runtime.
test('repository has exactly the three selected Compose YAML files', () => {
	assert.deepEqual(
		readdirSync(root)
			.filter((name) => /^compose.*\.ya?ml$/.test(name))
			.sort(),
		['compose.dev.yml', 'compose.prod.yml', 'compose.yml']
	);
});

test('direct standalone resolves without .env, tunnel, Demo, providers or published database', () => {
	const model = config(['-p', 'spellbook-selfhost', 'config'], {});
	assert.deepEqual(Object.keys(model.services).sort(), [
		'api',
		'db-migrate',
		'frontend',
		'postgres',
		'scan-worker',
		'state-worker'
	]);
	assert.equal(model.services.postgres.environment.POSTGRES_HOST_AUTH_METHOD, 'trust');
	assert.deepEqual(model.services.frontend.ports, ['127.0.0.1:3000:3000']);
	for (const [name, service] of Object.entries(model.services)) {
		if (name !== 'frontend') assert.equal(service.ports, undefined);
		if (name !== 'postgres') assert.equal(service.environment?.DEMO_MODE ?? 'false', 'false');
	}
	assert.deepEqual(model.services['db-migrate'].command, [
		'/app/backend/api/.venv/bin/spellbook-migrate'
	]);
	assert.equal(model.services.api.environment.SCAN_STORAGE_DRIVER, undefined);
	assert.equal(model.services.api.network_mode, 'service:frontend');
	assert.equal(model.services.api.volumes, undefined);
	assert.equal(model.services.api.environment.S3_ACCESS_KEY_ID, undefined);
});

test('no-env dev preserves project/data identities and matches port with build/API origin', () => {
	const plan = developmentPlan(false, { DEV_LOCAL_PORT: '5192' });
	const model = config([...plan.args.slice(0, -3), 'config'], plan.env);
	assert.equal(plan.args[1], 'spellbook-dev-local');
	assert.equal(model.services.postgres.environment.POSTGRES_DB, 'spellbook_dev');
	assert.deepEqual(Object.keys(model.volumes).sort(), ['postgres18_data', 'worker_data']);
	assert.deepEqual(model.services.frontend.ports, ['127.0.0.1:5192:3000']);
	assert.equal(
		model.services.frontend.build.args.find((value) => value.startsWith('APP_ORIGIN=')),
		'APP_ORIGIN=http://localhost:5192'
	);
	assert.equal(model.services.api.environment.APP_ORIGIN, 'http://localhost:5192');
});

test('configured dev is independent, has Newt and fails on missing private settings', () => {
	const env = {
		DEV_APP_ORIGIN: 'https://dev.example.test',
		DEV_POSTGRES_PASSWORD: 'fixture-only',
		DEV_PANGOLIN_ENDPOINT: 'https://gateway.example.test',
		DEV_NEWT_ID: 'fixture',
		DEV_NEWT_SECRET: 'fixture-only'
	};
	const args = [
		'--env-file',
		'/dev/null',
		'-p',
		'spellbook-dev',
		'-f',
		'compose.dev.yml',
		'config'
	];
	const model = config(args, env);
	noPorts(model);
	assert.equal(model.services.api.environment.DEMO_MODE, 'false');
	assert.equal(model.services.postgres.environment.POSTGRES_DB, 'spellbook_dev');
	assert.equal(model.services.newt.environment.NEWT_ID, 'fixture');
	for (const key of Object.keys(env)) {
		const incomplete = { ...env };
		delete incomplete[key];
		assert.throws(() => config(args, incomplete), new RegExp(key));
	}
});

test('hosted Demo config preserves services, immutable tags, private volumes and ingress aliases', () => {
	const plan = hostedPlan('demo', 'config', fixture);
	const model = config(plan.args, plan.env);
	noPorts(model);
	assert.equal(plan.args[3], 'spellbook-demo');
	assert.equal(model.services.newt, undefined);
	assert.equal(model.services.worker, undefined);
	assert.equal(model.services.postgres.environment.POSTGRES_DB, 'spellbook_demo');
	assert.deepEqual(Object.keys(model.volumes).sort(), ['postgres18_data', 'worker_data']);
	for (const [name, service] of Object.entries(model.services)) {
		if (name !== 'postgres')
			assert.equal(service.image, `localhost/spellbook-demo-${name}:git-${sha.slice(0, 12)}`);
		if (['api', 'frontend', 'state-worker', 'db-migrate'].includes(name))
			assert.equal(service.environment.DEMO_MODE, 'true');
		if (!['frontend', 'api'].includes(name)) assert.equal(service.networks, undefined);
	}
	assert.match(
		model.services['db-migrate'].command[2],
		/spellbook-migrate; if.*DEMO_MODE.*spellbook-demo-seed/
	);
	assert.deepEqual(model.services.frontend.networks.ingress.aliases, ['spellbook-demo-web']);
	assert.equal(model.networks.ingress.name, 'spellbook-prod-ingress');
	assert.equal(model.networks.ingress.external, true);
	assert.equal(model.networks.default.driver_opts.isolate, 'true');
	assert.equal(model.services.api.volumes, undefined);
});

test('production retains normal accounts, transient Scan and scheduled Catalog lifecycle', () => {
	const plan = hostedPlan('production', 'config', fixture);
	const model = config(plan.args, plan.env);
	noPorts(model);
	assert.equal(plan.args[3], 'spellbook');
	assert.equal(model.networks.default.driver_opts.isolate, 'true');
	assert.equal(model.services.newt, undefined);
	assert.equal(model.services.api.environment.DEMO_MODE, 'false');
	assert.equal(model.services.api.environment.SCAN_STORAGE_DRIVER, undefined);
	assert.equal(model.services.api.volumes, undefined);
	assert.equal(model.services['scan-worker'].volumes, undefined);
	assert.equal(model.services.worker.environment.SYNC_INTERVAL, 'daily');
	assert.equal(model.services.worker.restart, 'unless-stopped');
	assert.deepEqual(model.services.frontend.networks.ingress.aliases, ['spellbook-production-web']);
	assert.equal(
		model.services.worker.depends_on['db-migrate'].condition,
		'service_completed_successfully'
	);
});

test('site config requires no application settings and starts only the existing connector identity', () => {
	const configuration = Object.fromEntries(
		Object.entries(fixture).filter(([key]) => /PROD_(INGRESS|PANGOLIN|NEWT)/.test(key))
	);
	const plan = hostedPlan('site', 'config', configuration);
	const model = config(plan.args, plan.env);
	assert.equal(plan.args[3], 'spellbook-site');
	assert.deepEqual(Object.keys(model.services), ['newt']);
	assert.deepEqual(model.services.newt.networks, ['ingress']);
	assert.equal(model.services.newt.depends_on, undefined);
	assert.equal(model.networks.ingress.name, 'spellbook-prod-ingress');
	const up = hostedPlan('site', 'up', configuration);
	assert.deepEqual(up.args.slice(-5), ['up', '--no-build', '--force-recreate', '-d', 'newt']);
});
