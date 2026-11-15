// Check commands of the automatic CI jobs. After provisioning, each job in ci.yml runs
// `node scripts/ci-checks.mjs <entry>`; `pnpm check:changed` runs the entries its changes select.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// The pinned uv runs everywhere, so the installed uv version does not matter.
const uv = 'uvx --from uv==0.12.23 uv';

const each = (cwd, ...commands) => commands.map((command) => ({ cwd, run: [command] }));
const uvPackage = (cwd, { core = false, mypy = true, pytest = true } = {}) => ({
	name: `${cwd} package checks`,
	cwd,
	run: [
		`${uv} lock --check --python 3.14.8`,
		`${uv} sync --frozen --extra dev --python 3.14.8${core ? ' --reinstall-package spellbook-core' : ''} --no-editable`,
		`${uv} run --no-sync ruff check`,
		`${uv} run --no-sync ruff format --check`,
		...(mypy ? [`${uv} run --no-sync mypy`] : []),
		`${uv} build`,
		...(pytest ? [`${uv} run --no-sync pytest`] : [])
	]
});
const boundaries = 'scripts/check_python_boundaries.py scripts/test_python_boundaries.py';
const scopeRequired = () => {
	throw new Error('CI_SCOPE must hold the CI Scope outputs');
};

// Each entry returns its steps. A step's commands stop at the first failure, like a CI step.
export const entries = {
	scope: () =>
		each(
			'.',
			'node --test scripts/docs.test.mjs',
			'node scripts/docs.mjs --check',
			'node --test scripts/ci-changes.test.mjs'
		),
	application: () => [
		...each('frontend', 'pnpm lint', 'pnpm --dir .. check:boundaries'),
		...each('.', 'pnpm --dir frontend check'),
		...each(
			'frontend',
			'pnpm test:unit',
			'pnpm --dir .. test:tooling',
			'pnpm --dir .. test:contracts'
		),
		{ cwd: 'frontend', run: ['pnpm --dir .. test:compose'], requires: { bin: 'podman-compose' } }
	],
	'python-backend': (scopes = scopeRequired()) => [
		uvPackage('backend/core'),
		uvPackage('backend/api', { core: true }),
		...(scopes.state_worker ? [uvPackage('backend/workers/state', { core: true })] : []),
		{
			name: 'Python import directions and negative fixtures',
			cwd: '.',
			run: [
				`${uv} run --project backend/api --no-sync ruff check --config backend/api/pyproject.toml ${boundaries}`,
				`${uv} run --project backend/api --no-sync ruff format --check --config backend/api/pyproject.toml ${boundaries}`,
				`${uv} run --project backend/api --no-sync python scripts/check_python_boundaries.py`,
				`${uv} run --project backend/api --no-sync python -m unittest discover -s scripts -p test_python_boundaries.py`
			]
		}
	],
	workers: (scopes = scopeRequired()) => [
		// Python API/Core runs these when it is selected.
		...(scopes.python_backend
			? []
			: [
					{
						name: 'Worker import directions and negative fixtures',
						cwd: '.',
						run: [
							`${uv} run --no-project --python 3.14.8 python scripts/check_python_boundaries.py`,
							`${uv} run --no-project --python 3.14.8 python -m unittest discover -s scripts -p test_python_boundaries.py`
						]
					}
				]),
		...(scopes.worker
			? [
					uvPackage('backend/workers/catalog', { mypy: false, pytest: false }),
					{
						name: 'Catalog worker tests',
						cwd: 'backend/workers/catalog',
						run: [`${uv} run --no-sync pytest`],
						// Without the database the publication tests skip, which would read as a pass.
						requires: {
							env: 'WORKER_TEST_DATABASE_URL',
							reason: 'Catalog worker tests need a disposable PostgreSQL 18 database'
						}
					}
				]
			: []),
		...(scopes.scan_worker ? [uvPackage('backend/workers/scan', { mypy: false })] : [])
	]
};

const onPath = (bin, env) =>
	(env.PATH ?? '').split(delimiter).some((directory) => {
		try {
			accessSync(join(directory, bin), constants.X_OK);
			return true;
		} catch {
			return false;
		}
	});

function missing({ run, requires }, env) {
	for (const bin of [...run.map((command) => command.split(' ')[0]), requires?.bin].filter(Boolean))
		if (!onPath(bin, env)) return `${bin} is not on PATH`;
	if (requires?.env && !env[requires.env]) return `${requires.env} is not set; ${requires.reason}`;
}

// Runs every step and returns its outcome: passed, failed, or not run with the reason.
export function runSteps(steps, { cwd = root, env = process.env, log = console.log } = {}) {
	const actions = env.GITHUB_ACTIONS === 'true';
	return steps.map((step) => {
		const name = step.name ?? step.run[0];
		const reason = missing(step, env);
		if (reason) {
			log(`${actions ? '::error::' : '\n'}not run: ${name}: ${reason}`);
			return { name, status: 'not run', reason };
		}
		for (const command of step.run) {
			log(
				actions
					? `::group::${command}`
					: `\n$ ${command}${step.cwd === '.' ? '' : `  (in ${step.cwd})`}`
			);
			const child = spawnSync(command, {
				cwd: join(cwd, step.cwd),
				env,
				shell: true,
				stdio: 'inherit'
			});
			if (actions) log('::endgroup::');
			if (child.status === 0) continue;
			const failure = `${command}: ${child.error?.message ?? (child.signal ? `signal ${child.signal}` : `exit ${child.status}`)}`;
			log(`${actions ? '::error::' : ''}failed: ${failure}`);
			return { name, status: 'failed', reason: failure };
		}
		return { name, status: 'passed' };
	});
}

// CI treats a step that could not run as a failure; local runs report it as incomplete.
export const exitCode = (outcomes, { strict }) =>
	outcomes.some(({ status }) => status === 'failed' || (strict && status === 'not run')) ? 1 : 0;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [entry, ...rest] = process.argv.slice(2);
	if (!Object.hasOwn(entries, entry) || rest.length) {
		console.error(`Usage: node scripts/ci-checks.mjs <${Object.keys(entries).join('|')}>`);
		process.exit(2);
	}
	const outputs = process.env.CI_SCOPE ? JSON.parse(process.env.CI_SCOPE) : undefined;
	const scopes =
		outputs &&
		Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, value === 'true']));
	const outcomes = runSteps(entries[entry](scopes));
	for (const { name, status, reason } of outcomes)
		console.log(`${status}: ${name}${reason ? ` (${reason})` : ''}`);
	process.exitCode = exitCode(outcomes, { strict: true });
}
