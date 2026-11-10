import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const images = ['db-migrate', 'api', 'frontend', 'state-worker', 'scan-worker', 'worker'];
const application = ['postgres', 'db-migrate', 'scan-worker', 'api', 'state-worker', 'frontend'];
const settings = [
	'APP_ORIGIN',
	'POSTGRES_DB',
	'POSTGRES_USER',
	'POSTGRES_PASSWORD',
	'FRONTEND_ALIAS',
	'SCAN_STORAGE_DRIVER',
	'S3_ENDPOINT',
	'S3_REGION',
	'S3_BUCKET',
	'S3_ACCESS_KEY_ID',
	'S3_SECRET_ACCESS_KEY',
	'S3_FORCE_PATH_STYLE',
	'VALUE_HISTORY_ENABLED',
	'VALUE_HISTORY_TIMEZONE',
	'ADDRESS_HEADER',
	'XFF_DEPTH',
	'BODY_SIZE_LIMIT',
	'CATALOG_SOURCE',
	'SYNC_INTERVAL',
	'CARDMARKET_PRICES_ENABLED',
	'MTGJSON_PRICES_ENABLED',
	'PRICE_COMPRESSED_BYTES',
	'PRICE_DECOMPRESSED_BYTES',
	'PRICE_RECORD_BYTES',
	'PRICE_PROGRESS_SECONDS',
	'PRICE_CONNECT_SECONDS',
	'PRICE_DOWNLOAD_SECONDS',
	'PRICE_PARSE_SECONDS',
	'PRICE_PUBLICATION_SECONDS',
	'PRICE_IMPORT_SECONDS',
	'PRICE_STAGING_BYTES'
];
const usage =
	'Usage: pnpm compose <demo|production|site> <config|build|up|down|stop|logs|run|exec> [--revision FULL_SHA] [service/command arguments]';

export function hostedPlan(mode, action, configuration, environment = {}, revision, extra = []) {
	if (
		!['demo', 'production', 'site'].includes(mode) ||
		!['config', 'build', 'up', 'down', 'stop', 'logs', 'run', 'exec'].includes(action)
	)
		throw new Error(usage);
	if (mode === 'site' && !['config', 'up', 'down', 'stop', 'logs'].includes(action))
		throw new Error('Site only supports config, up, down, stop and logs.');
	const env = Object.fromEntries(
		Object.entries(environment).filter(
			([key]) => !key.startsWith('HOSTED_') && key !== 'COMPOSE_PROFILES'
		)
	);
	const required = ['PROD_INGRESS_NETWORK'];
	const prefix = mode === 'demo' ? 'DEMO' : 'PROD';
	if (mode === 'site') {
		required.push('PROD_PANGOLIN_ENDPOINT', 'PROD_NEWT_ID', 'PROD_NEWT_SECRET');
		for (const key of ['PANGOLIN_ENDPOINT', 'NEWT_ID', 'NEWT_SECRET'])
			env[`HOSTED_${key}`] = configuration[`PROD_${key}`] || '';
	} else {
		required.push(
			...['APP_ORIGIN', 'POSTGRES_PASSWORD', 'FRONTEND_ALIAS'].map((key) => `${prefix}_${key}`)
		);
		for (const key of settings) env[`HOSTED_${key}`] = configuration[`${prefix}_${key}`] || '';
		env.HOSTED_DEMO_MODE = String(mode === 'demo');
		env.HOSTED_POSTGRES_DB ||= mode === 'demo' ? 'spellbook_demo' : 'spellbook';
		env.HOSTED_POSTGRES_USER ||= 'spellbook';
		env.HOSTED_SCAN_STORAGE_DRIVER ||= 'local';
		if (mode === 'demo') {
			if (!/_(demo|design)$/.test(env.HOSTED_POSTGRES_DB))
				throw new Error('DEMO_POSTGRES_DB must end in _demo or _design.');
			env.HOSTED_SCAN_STORAGE_DRIVER = 'local';
			env.HOSTED_CATALOG_SOURCE = 'all_cards';
			env.HOSTED_SYNC_INTERVAL = 'manual';
			env.HOSTED_WORKER_RESTART = 'no';
		}
		if (!['local', 's3'].includes(env.HOSTED_SCAN_STORAGE_DRIVER))
			throw new Error(`${prefix}_SCAN_STORAGE_DRIVER must be local or s3.`);
		if (env.HOSTED_SCAN_STORAGE_DRIVER === 's3')
			required.push(
				...['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].map(
					(key) => `${prefix}_${key}`
				)
			);
		revision ||= configuration[`${prefix}_IMAGE_REVISION`];
		if (!/^[0-9a-f]{40}$/.test(revision || ''))
			throw new Error(`Set ${prefix}_IMAGE_REVISION or --revision to a full Git SHA.`);
		for (const name of images)
			env[`HOSTED_${name.toUpperCase().replaceAll('-', '_')}_IMAGE`] =
				`localhost/spellbook-${mode === 'demo' ? 'demo' : 'production'}-${name}:git-${revision.slice(0, 12)}`;
	}
	const missing = required.filter((key) => !configuration[key]?.trim());
	if (missing.length) throw new Error(`Missing configuration: ${missing.join(', ')}`);
	if (mode !== 'site') {
		let origin;
		try {
			origin = new URL(env.HOSTED_APP_ORIGIN);
		} catch {
			/* Report the key, never its value. */
		}
		if (
			!origin ||
			!['http:', 'https:'].includes(origin.protocol) ||
			origin.origin !== env.HOSTED_APP_ORIGIN
		)
			throw new Error(`${prefix}_APP_ORIGIN must be an HTTP(S) origin without a path.`);
	}
	env.HOSTED_INGRESS_NETWORK = configuration.PROD_INGRESS_NETWORK;
	const services =
		mode === 'site' ? ['newt'] : [...application, ...(mode === 'production' ? ['worker'] : [])];
	// No arbitrary Compose flags can turn a rollout into a rebuild, pull or volume deletion.
	if (['config', 'build', 'down'].includes(action) && extra.length)
		throw new Error('This action accepts no additional arguments.');
	if (['up', 'stop', 'logs', 'run', 'exec'].includes(action)) {
		const allowed = mode === 'site' ? ['newt'] : [...application, 'worker'];
		if ((!extra.length && action !== 'up') || (extra.length && !allowed.includes(extra[0])))
			throw new Error('Name a service in the selected mode before any command arguments.');
		if (['up', 'stop', 'logs'].includes(action) && extra.some((name) => !allowed.includes(name)))
			throw new Error('Only selected-mode service names are allowed.');
	}
	const args = [
		'--env-file',
		'/dev/null',
		'-p',
		mode === 'site' ? 'spellbook-site' : mode === 'demo' ? 'spellbook-demo' : 'spellbook',
		'-f',
		'compose.prod.yml'
	];
	args.push('--profile', mode === 'site' ? 'site' : 'application');
	if (mode === 'production' || action === 'build' || extra[0] === 'worker')
		args.push('--profile', 'catalog');
	if (action === 'up')
		args.push('up', '--no-build', '--force-recreate', '-d', ...(extra.length ? extra : services));
	else if (action === 'build') args.push('build', ...images);
	else if (action === 'run') args.push('run', '--rm', '-T', '--no-deps', ...extra);
	else args.push(action, ...extra);
	return {
		args,
		env,
		revision,
		images:
			mode === 'site'
				? []
				: images.map((name) => env[`HOSTED_${name.toUpperCase().replaceAll('-', '_')}_IMAGE`]),
		mode,
		action
	};
}

export function executeHosted(plan, run = spawnSync, cwd = root) {
	const invoke = (command, args, capture = false) => {
		const result = run(command, args, {
			cwd,
			env: plan.env,
			encoding: 'utf8',
			stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
		});
		if (result.error || result.status !== 0)
			throw new Error(
				`${command} failed${result.status == null ? '' : ` with exit code ${result.status}`}.`
			);
		return result.stdout?.trim();
	};
	if (plan.action === 'build') {
		if (
			invoke('git', ['status', '--porcelain'], true) ||
			invoke('git', ['rev-parse', 'HEAD'], true) !== plan.revision
		)
			throw new Error('Build requires a clean checkout at the selected revision.');
		// Existing immutable tags must never be overwritten by a rebuild.
		for (const image of plan.images) {
			const found = run('podman', ['image', 'exists', image], {
				cwd,
				env: plan.env,
				stdio: 'ignore'
			});
			if (found.error || ![0, 1].includes(found.status))
				throw new Error('Could not inspect local images.');
			if (found.status === 0)
				throw new Error('An immutable image tag already exists. Select a new revision.');
		}
	}
	if (['up', 'run'].includes(plan.action))
		for (const image of plan.images) invoke('podman', ['image', 'exists', image], true);
	invoke('podman-compose', plan.args);
	if (
		plan.action === 'build' &&
		(invoke('git', ['status', '--porcelain'], true) ||
			invoke('git', ['rev-parse', 'HEAD'], true) !== plan.revision)
	)
		throw new Error('Source changed during build. Do not roll out these images.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	try {
		const [mode, action, ...rest] = process.argv.slice(2);
		let revision;
		if (rest[0] === '--revision') {
			[, revision] = rest.splice(0, 2);
			if (!revision) throw new Error(usage);
		}
		const configuration = {
			...parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')),
			...process.env
		};
		executeHosted(hostedPlan(mode, action, configuration, process.env, revision, rest));
	} catch (cause) {
		console.error(
			cause.code === 'ENOENT' ? 'A private root .env is required for hosted modes.' : cause.message
		);
		process.exitCode = 1;
	}
}
