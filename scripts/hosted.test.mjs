import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHosted, hostedPlan } from './compose.mjs';

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
	PROD_IMAGE_REVISION: sha,
	PROD_S3_ENDPOINT: 'https://storage.example.test',
	PROD_S3_BUCKET: 'fixture-scans',
	PROD_S3_ACCESS_KEY_ID: 'fixture-only',
	PROD_S3_SECRET_ACCESS_KEY: 'fixture-only'
};

test('mode validation rejects missing settings, revision drift and unsafe commands without leaking values', () => {
	for (const mode of ['demo', 'production', 'site'])
		assert.throws(() => hostedPlan(mode, 'config', {}, {}, sha), /Missing configuration/);
	assert.throws(
		() => hostedPlan('demo', 'up', { ...fixture, DEMO_POSTGRES_PASSWORD: '' }),
		/DEMO_POSTGRES_PASSWORD/
	);
	assert.throws(
		() => hostedPlan('demo', 'up', { ...fixture, DEMO_IMAGE_REVISION: 'latest' }),
		/full Git SHA/
	);
	assert.throws(
		() => hostedPlan('demo', 'up', { ...fixture, DEMO_POSTGRES_DB: 'spellbook' }),
		/_demo or _design/
	);
	assert.throws(
		() => hostedPlan('production', 'up', { ...fixture, PROD_S3_ACCESS_KEY_ID: '' }),
		/PROD_S3_ACCESS_KEY_ID/
	);
	assert.throws(
		() => hostedPlan('demo', 'up', { ...fixture, DEMO_APP_ORIGIN: 'private-invalid-value' }),
		(error) => !error.message.includes('private-invalid-value')
	);
	assert.throws(() => hostedPlan('site', 'build', fixture), /Site only/);
	assert.throws(
		() => hostedPlan('demo', 'up', fixture, {}, undefined, ['--build']),
		/selected mode/
	);
	assert.throws(
		() => hostedPlan('demo', 'down', fixture, {}, undefined, ['--volumes']),
		/additional arguments/
	);
	assert.throws(() => hostedPlan('demo', 'run', fixture, {}, undefined, ['newt']), /selected mode/);
	const plan = hostedPlan('demo', 'config', fixture, {
		HOSTED_DEMO_MODE: 'false',
		HOSTED_API_IMAGE: 'wrong:latest',
		COMPOSE_PROFILES: 'site,catalog'
	});
	assert.equal(plan.env.HOSTED_DEMO_MODE, 'true');
	assert.equal(plan.env.COMPOSE_PROFILES, undefined);
	assert.match(plan.env.HOSTED_API_IMAGE, /:git-fdb40bd8bc11$/);
});

test('rollout checks existing local images and never builds or pulls; absent tags stop before Compose', () => {
	const plan = hostedPlan('demo', 'up', fixture);
	const calls = [];
	executeHosted(plan, (command, args) => {
		calls.push([command, args]);
		return { status: 0, stdout: '' };
	});
	assert.equal(calls.filter(([command]) => command === 'podman').length, 6);
	assert.equal(calls.at(-1)[0], 'podman-compose');
	assert.ok(plan.args.includes('--no-build'));
	assert.ok(plan.args.includes('--force-recreate'));
	assert.ok(!plan.args.includes('--build'));
	assert.ok(!plan.args.includes('newt'));
	let count = 0;
	assert.throws(
		() =>
			executeHosted(plan, () => {
				count++;
				return { status: 1 };
			}),
		/exit code 1/
	);
	assert.equal(count, 1);
});

test('build requires clean selected source and refuses to overwrite immutable images', () => {
	const plan = hostedPlan('demo', 'build', fixture);
	for (const [dirty, head, exists, message] of [
		[' M compose.yml', sha, 1, /clean checkout/],
		['', 'a'.repeat(40), 1, /clean checkout/],
		['', sha, 0, /already exists/]
	]) {
		assert.throws(
			() =>
				executeHosted(plan, (command, args) => ({
					status: command === 'podman' ? exists : 0,
					stdout: args[0] === 'status' ? dirty : head
				})),
			message
		);
	}
	const calls = [];
	executeHosted(plan, (command, args) => {
		calls.push([command, args]);
		return { status: command === 'podman' ? 1 : 0, stdout: args[0] === 'status' ? '' : sha };
	});
	assert.ok(
		calls.find(([command, args]) => command === 'podman-compose' && args.includes('build'))
	);
	let built = false;
	assert.throws(
		() =>
			executeHosted(plan, (command, args) => {
				if (command === 'podman-compose') built = true;
				return {
					status: command === 'podman' ? 1 : 0,
					stdout: args[0] === 'status' ? (built ? ' M compose.yml' : '') : sha
				};
			}),
		/Source changed during build/
	);
});

test('hosted CLI loads only selected prefixed .env settings and preserves command failures', async () => {
	const { cp, mkdir, mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
	const { spawnSync } = await import('node:child_process');
	const { join } = await import('node:path');
	const { tmpdir } = await import('node:os');
	const directory = await mkdtemp(join(tmpdir(), 'spellbook-hosted-cli-'));
	try {
		await mkdir(join(directory, 'scripts'));
		await mkdir(join(directory, 'bin'));
		await cp(new URL('./compose.mjs', import.meta.url), join(directory, 'scripts/compose.mjs'));
		const record = join(directory, 'called.json');
		await writeFile(
			join(directory, 'bin/podman-compose'),
			`#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
writeFileSync(process.env.COMPOSE_TEST_RECORD, JSON.stringify({args: process.argv.slice(2), origin: process.env.HOSTED_APP_ORIGIN, image: process.env.HOSTED_API_IMAGE, cwd: process.cwd()}));
process.exit(Number(process.env.COMPOSE_TEST_STATUS || 0));
`,
			{ mode: 0o755 }
		);
		const env = {
			PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
			COMPOSE_TEST_RECORD: record,
			HOSTED_API_IMAGE: 'unwanted:latest',
			HOSTED_APP_ORIGIN: 'https://unwanted.example.test'
		};
		const run = (mode = 'demo') =>
			spawnSync(process.execPath, [join(directory, 'scripts/compose.mjs'), mode, 'config'], {
				env,
				encoding: 'utf8'
			});
		assert.equal(run().status, 1);
		assert.match(run().stderr, /private root .env/);
		await writeFile(
			join(directory, '.env'),
			Object.entries(fixture)
				.map(([key, value]) => `${key}=${value}`)
				.join('\n'),
			{ mode: 0o600 }
		);
		assert.equal(run().status, 0);
		let called = JSON.parse(await readFile(record, 'utf8'));
		assert.equal(called.origin, fixture.DEMO_APP_ORIGIN);
		assert.equal(called.image, `localhost/spellbook-demo-api:git-${sha.slice(0, 12)}`);
		assert.equal(called.cwd, directory);
		assert.ok(called.args.includes('compose.prod.yml'));
		assert.equal(run('site').status, 0);
		called = JSON.parse(await readFile(record, 'utf8'));
		assert.equal(called.origin, undefined);
		assert.equal(called.image, undefined);
		assert.ok(called.args.includes('spellbook-site'));
		env.COMPOSE_TEST_STATUS = '23';
		const failed = run();
		assert.equal(failed.status, 1);
		assert.match(failed.stderr, /exit code 23/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
