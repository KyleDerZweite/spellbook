import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { developmentPlan } from './dev.mjs';

const configured = {
	DEV_APP_ORIGIN: 'https://dev.example.test',
	DEV_POSTGRES_PASSWORD: 'fixture-only',
	DEV_PANGOLIN_ENDPOINT: 'https://gateway.example.test',
	DEV_NEWT_ID: 'fixture-site',
	DEV_NEWT_SECRET: 'fixture-only'
};

test('no-.env startup selects isolated Development, localhost and no tunnel', () => {
	const inherited = { DEV_APP_ORIGIN: 'https://another.example.test' };
	const plan = developmentPlan(false, inherited);
	assert.deepEqual(plan.args, [
		'-p',
		'spellbook-dev-local',
		'-f',
		'compose.development.yml',
		'-f',
		'compose.development-local.yml',
		'up',
		'--build',
		'-d'
	]);
	assert.equal(plan.env.DEV_APP_ORIGIN, 'http://localhost:3000');
	assert.equal(plan.env.DEV_LOCAL_PORT, '3000');
	assert.equal(inherited.DEV_APP_ORIGIN, 'https://another.example.test');
});

test('configured Development uses its private .env and tunnel without the Demo stack', () => {
	const plan = developmentPlan(true, configured);
	assert.deepEqual(plan.args, [
		'--env-file',
		'.env',
		'-p',
		'spellbook-dev',
		'-f',
		'compose.development.yml',
		'-f',
		'compose.development-tunnel.yml',
		'--profile',
		'tunnel',
		'up',
		'--build',
		'-d'
	]);
	assert.equal(plan.env.DEV_APP_ORIGIN, configured.DEV_APP_ORIGIN);
	assert.equal(plan.env.DEV_NEWT_SECRET, configured.DEV_NEWT_SECRET);
});

test('local port overrides keep frontend publication and canonical Origin aligned', () => {
	assert.equal(developmentPlan(false, { DEV_LOCAL_PORT: '05192' }).env.DEV_LOCAL_PORT, '5192');
	assert.equal(
		developmentPlan(false, { DEV_LOCAL_PORT: '5192' }).env.DEV_APP_ORIGIN,
		'http://localhost:5192'
	);
	assert.equal(
		developmentPlan(false, { DEV_LOCAL_PORT: '80' }).env.DEV_APP_ORIGIN,
		'http://localhost'
	);
	for (const port of ['0', '65536', 'invalid', '3000/path'])
		assert.throws(() => developmentPlan(false, { DEV_LOCAL_PORT: port }), /DEV_LOCAL_PORT/);
});

test('stop uses the same selected project and preserves volumes', () => {
	for (const hasEnvironment of [false, true]) {
		const up = developmentPlan(hasEnvironment, configured);
		const down = developmentPlan(hasEnvironment, configured, 'down');
		assert.deepEqual(down.args, [...up.args.slice(0, -3), 'down']);
		assert.ok(!down.args.includes('--volumes'));
	}
	assert.throws(() => developmentPlan(false, {}, 'reset'), /Usage:/);
});

test('CLI detects .env and invokes only the selected Compose command', async () => {
	const parent = fileURLToPath(new URL('../.local/', import.meta.url));
	await mkdir(parent, { recursive: true });
	const directory = await mkdtemp(join(parent, 'dev-launcher-'));
	try {
		await mkdir(join(directory, 'scripts'));
		await mkdir(join(directory, 'bin'));
		await cp(new URL('./dev.mjs', import.meta.url), join(directory, 'scripts/dev.mjs'));
		const record = join(directory, 'called.json');
		await writeFile(
			join(directory, 'bin/podman-compose'),
			`#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.DEV_TEST_RECORD, JSON.stringify({ args: process.argv.slice(2), origin: process.env.DEV_APP_ORIGIN, cwd: process.cwd() }));
process.exit(Number(process.env.DEV_TEST_STATUS || 0));
`,
			{ mode: 0o755 }
		);
		const env = Object.fromEntries(
			Object.entries(process.env).filter(([key]) => !/^(DEV_|COMPOSE_)/.test(key))
		);
		env.PATH = `${join(directory, 'bin')}:${env.PATH}`;
		env.DEV_TEST_RECORD = record;
		const run = () =>
			spawnSync(process.execPath, [join(directory, 'scripts/dev.mjs')], {
				env,
				encoding: 'utf8'
			});
		assert.equal(run().status, 0);
		let called = JSON.parse(await readFile(record, 'utf8'));
		assert.ok(called.args.includes('compose.development-local.yml'));
		assert.equal(called.cwd, directory);
		assert.equal(called.origin, 'http://localhost:3000');
		await writeFile(
			join(directory, '.env'),
			Object.entries(configured)
				.map(([key, value]) => `${key}=${value}`)
				.join('\n')
		);
		assert.equal(run().status, 0);
		called = JSON.parse(await readFile(record, 'utf8'));
		assert.ok(called.args.includes('compose.development-tunnel.yml'));
		// Compose reads its .env itself; the launcher does not override its interpolation.
		assert.equal(called.origin, undefined);
		assert.deepEqual(called.args.slice(0, 2), ['--env-file', '.env']);
		env.DEV_TEST_STATUS = '23';
		assert.equal(run().status, 23);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
