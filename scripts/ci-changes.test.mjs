import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	renameSync,
	rmSync,
	readFileSync,
	readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPaths, selectChecks } from './ci-changes.mjs';

const app = { application: true, worker: false, scan_worker: false };
const all = { application: true, worker: true, scan_worker: true };
const none = { application: false, worker: false, scan_worker: false };

const workflow = (name) =>
	readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
const triggers = (source) => source.match(/^on:\n((?:[ \t].*\n|\n)+)/m)?.[1].trim();

test('heavy workflows accept only manual dispatch and keep their complete commands', () => {
	const android = workflow('android.yml');
	const integration = workflow('application-integration.yml');
	for (const source of [android, integration]) {
		assert.equal(triggers(source), 'workflow_dispatch:');
		assert.doesNotMatch(source, /^concurrency:|^    (needs|if):|continue-on-error:/m);
	}
	assert.equal([...android.split(/^jobs:\n/m)[1].matchAll(/^  [\w-]+:\n/gm)].length, 1);
	assert.match(
		android,
		/uses: actions\/setup-java@v5\n\s+with:\n\s+distribution: temurin\n\s+java-version: '21'/
	);
	assert.match(android, /uses: android-actions\/setup-android@v4\.0\.4/);
	assert.match(android, /packages: 'platform-tools platforms;android-37\.0 build-tools;36\.0\.0'/);
	assert.match(android, /log-accepted-android-sdk-licenses: false/);
	assert.match(
		android,
		/run: \.\/gradlew --no-daemon :app:lintDebug :app:testDebugUnitTest :app:assembleDebug/
	);
	assert.match(integration, /image: postgres:18\.6-bookworm/);
	assert.match(
		integration,
		/uv sync --project \.\.\/scan-worker --frozen --extra dev --python 3\.14\.8/
	);
	assert.match(
		integration,
		/uv run --project \.\.\/scan-worker --no-sync uvicorn scan_worker\.main:app/
	);
	for (const command of ['db:migrate', 'test:integration', 'test:http', 'test:scan', 'test:sync'])
		assert.ok(integration.includes(`- run: pnpm ${command}\n`), command);
	assert.match(
		integration,
		/run: pnpm --dir \.\. build\n\s+env:\n\s+APP_ORIGIN: http:\/\/127\.0\.0\.1:5191/
	);
	assert.match(integration, /name: Stop the owned Scan worker\n\s+if: always\(\)/);
});

test('automatic CI retains scoped checks without invoking a heavy workflow', () => {
	const source = workflow('ci.yml');
	assert.equal([...source.split(/^jobs:\n/m)[1].matchAll(/^  [\w-]+:\n/gm)].length, 3);
	assert.equal(
		triggers(source),
		'push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:'
	);
	assert.doesNotMatch(
		source,
		/android|gradlew|uvicorn|test:(integration|http|scan|sync)|workflow_call|workflow_run|dispatches|gh workflow run|uses: \.\//
	);
	assert.match(source, /run: node --test scripts\/ci-changes.test.mjs/);
	assert.match(source, /run: node scripts\/ci-changes.mjs/);
	assert.match(source, /needs: changes\n\s+if: needs.changes.outputs.application == 'true'/);
	for (const command of [
		'lint',
		'test:unit',
		'--dir .. test:tooling',
		'--dir ../backend test',
		'db:check'
	])
		assert.ok(source.includes(`- run: pnpm ${command}\n`), command);
	assert.doesNotMatch(source, /run: pnpm (test:dev|--dir \.\. test:(dev|packaging|boundaries))/);
	for (const key of ['application', 'worker', 'scan_worker'])
		assert.ok(source.includes(`${key}: \${{ steps.scope.outputs.${key} }}`), key);
	assert.match(
		source,
		/if: needs.changes.outputs.worker == 'true' \|\| needs.changes.outputs.scan_worker == 'true'/
	);
	assert.match(
		source,
		/image: \$\{\{ needs.changes.outputs.worker == 'true' && 'postgres:18\.6-bookworm' \|\| '' }}/
	);
	assert.match(
		source,
		/if: \$\{\{ !cancelled\(\) && needs.changes.outputs.scan_worker == 'true' }}/
	);
	for (const command of [
		'uv lock --check',
		'uv sync --frozen',
		'ruff check',
		'ruff format --check',
		'pytest'
	])
		assert.equal(source.split(command).length - 1, 2, command);
});

test('only automatic runs cancel superseded work and every job has a bounded timeout', () => {
	const source = workflow('ci.yml');
	assert.match(
		source,
		/group: \$\{\{ github.workflow }}-\$\{\{ github.event.pull_request.number \|\| \(github.event_name == 'push' && github.ref\) \|\| github.run_id }}/
	);
	assert.match(
		source,
		/cancel-in-progress: \$\{\{ github.event_name == 'pull_request' \|\| github.event_name == 'push' }}/
	);
	const directory = new URL('../.github/workflows/', import.meta.url);
	for (const name of readdirSync(directory).filter((name) => name.endsWith('.yml'))) {
		const text = workflow(name);
		const jobs = text.split(/^jobs:\n/m)[1];
		assert.ok(jobs, name);
		const timeouts = [...jobs.matchAll(/^    timeout-minutes: (\d+)$/gm)];
		assert.equal(timeouts.length, [...jobs.matchAll(/^  [\w-]+:\n/gm)].length, name);
		assert.ok(
			timeouts.every(([, minutes]) => Number(minutes) > 0 && Number(minutes) <= 30),
			name
		);
		if (/gradlew|test:(integration|http|scan|sync)|uvicorn/.test(text))
			assert.equal(triggers(text), 'workflow_dispatch:', name);
	}
});

test('source changes select their consumers, including SQL and Scan cross-project consumers', () => {
	for (const path of [
		'frontend/src/page.svelte',
		'backend/src/auth.ts',
		'scripts/check-client.mjs'
	])
		assert.deepEqual(classifyPaths([path]), app);
	assert.deepEqual(classifyPaths(['worker/src/worker/main.py']), {
		...none,
		worker: true
	});
	assert.deepEqual(classifyPaths(['scan-worker/uv.lock']), {
		...app,
		scan_worker: true
	});
	assert.deepEqual(classifyPaths(['frontend/drizzle/0024.sql']), {
		...app,
		worker: true
	});
	assert.deepEqual(classifyPaths(['frontend/drizzle/meta/_journal.json']), {
		...app,
		worker: true
	});
	assert.deepEqual(classifyPaths(['worker/uv.lock', 'scan-worker/tests/test_scan.py']), all);
});

test('shared workflow/toolchain and unknown files select every automatic suite', () => {
	for (const path of [
		'.github/workflows/ci.yml',
		'scripts/ci-changes.mjs',
		'scripts/ci-changes.test.mjs',
		'.dockerignore',
		'podman-compose.yml',
		'new-package/source.ts'
	])
		assert.deepEqual(classifyPaths([path]), all, path);
});

test('known documentation avoids runtime suites without hiding mixed source changes', () => {
	const docs = [
		'docs/operations/github-automation.md',
		'README.md',
		'AGENTS.md',
		'worker/README.md',
		'LICENSE'
	];
	assert.deepEqual(classifyPaths(docs), none);
	assert.deepEqual(classifyPaths([...docs, 'frontend/tests/unit/deck.test.ts']), app);
});

test('manual/unknown events and missing or invalid comparisons run all automatic suites', () => {
	for (const eventName of ['push', 'workflow_dispatch', 'unexpected', undefined])
		assert.deepEqual(selectChecks({ eventName }), all);
	for (const base of [undefined, '', 'bad', '--output=/tmp/untrusted'])
		assert.deepEqual(selectChecks({ eventName: 'pull_request', base, head: 'a'.repeat(40) }), all);
	assert.deepEqual(
		selectChecks({
			eventName: 'pull_request',
			base: 'a'.repeat(40),
			head: 'b'.repeat(40),
			cwd: tmpdir()
		}),
		all
	);
});

function repository(run) {
	const cwd = mkdtempSync(join(tmpdir(), 'spellbook-ci-'));
	const git = (...args) =>
		execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).trim();
	const write = (path, content = 'fixture\n') => {
		mkdirSync(join(cwd, path, '..'), { recursive: true });
		writeFileSync(join(cwd, path), content);
	};
	const commit = () => {
		git('add', '-A');
		git(
			'-c',
			'user.name=CI test',
			'-c',
			'user.email=ci@example.invalid',
			'commit',
			'-qm',
			'fixture'
		);
		return git('rev-parse', 'HEAD');
	};
	try {
		git('init', '-q');
		run({ cwd, git, write, commit });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test('real Git renames expose the deleted source and preserve NUL-delimited filenames', () => {
	repository(({ cwd, write, commit }) => {
		write('frontend/drizzle/old.sql');
		const base = commit();
		mkdirSync(join(cwd, 'worker'), { recursive: true });
		renameSync(join(cwd, 'frontend/drizzle/old.sql'), join(cwd, 'worker/renamed\nwith spaces.sql'));
		const head = commit();
		assert.deepEqual(selectChecks({ eventName: 'pull_request', base, head, cwd }), {
			...app,
			worker: true
		});
	});
});

test('PR comparison uses merge base and includes source changes beyond 3000 documentation paths', () => {
	repository(({ cwd, git, write, commit }) => {
		write('README.md');
		const common = commit();
		git('checkout', '-qb', 'feature');
		for (let i = 0; i < 3001; i++) write(`docs/${i}.md`);
		write('frontend/src/page.svelte');
		const head = commit();
		git('checkout', '-q', '-b', 'base', common);
		write('worker/base-only.py');
		const base = commit();
		assert.deepEqual(selectChecks({ eventName: 'pull_request', base, head, cwd }), app);
	});
});

test('CLI writes literal booleans to GitHub outputs without dependencies', () => {
	repository(({ cwd, write, commit }) => {
		write('README.md');
		const base = commit();
		write('docs/new.md');
		const head = commit();
		const output = join(cwd, 'outputs');
		execFileSync(process.execPath, [new URL('./ci-changes.mjs', import.meta.url).pathname], {
			cwd,
			env: {
				...process.env,
				CI_EVENT_NAME: 'pull_request',
				CI_BASE_SHA: base,
				CI_HEAD_SHA: head,
				GITHUB_OUTPUT: output
			}
		});
		assert.equal(
			readFileSync(output, 'utf8'),
			'application=false\nworker=false\nscan_worker=false\n'
		);
	});
});

test('native changes stay manual while application consumers retain automatic checks', () => {
	assert.deepEqual(classifyPaths(['android/app/src/main/MainActivity.kt']), none);
	assert.deepEqual(classifyPaths(['android/gradle/libs.versions.toml']), none);
	assert.deepEqual(classifyPaths(['backend/src/http/inventory.ts']), app);
	assert.deepEqual(classifyPaths(['backend/Dockerfile']), app);
	assert.deepEqual(classifyPaths(['frontend/Dockerfile']), app);
	assert.deepEqual(classifyPaths(['worker/Dockerfile']), { ...none, worker: true });
	assert.deepEqual(classifyPaths(['backend/drizzle/meta/_journal.json']), { ...app, worker: true });
	assert.deepEqual(classifyPaths(['contracts/src/inventory.ts']), app);
});

test('JavaScript manifests do not run unrelated Python or Android suites', () => {
	for (const path of [
		'package.json',
		'pnpm-lock.yaml',
		'pnpm-workspace.yaml',
		'frontend/.node-version'
	])
		assert.deepEqual(classifyPaths([path]), app, path);
});

test('main pushes select their actual changed paths as well', () => {
	repository(({ cwd, write, commit }) => {
		write('README.md');
		let base = commit();
		for (const [path, checks] of [
			['docs/changed.md', none],
			['android/app/src/main/MainActivity.kt', none],
			['backend/src/http/inventory.ts', app],
			['unknown/source.ts', all]
		]) {
			write(path);
			const head = commit();
			assert.deepEqual(selectChecks({ eventName: 'push', base, head, cwd }), checks, path);
			base = head;
		}
	});
});
