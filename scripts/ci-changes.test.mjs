import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPaths, selectChecks } from './ci-changes.mjs';

const app = { application: true, worker: false, scan_worker: false };
const all = { application: true, worker: true, scan_worker: true };
const none = { application: false, worker: false, scan_worker: false };

test('source changes select their consumers, including SQL and Scan cross-project consumers', () => {
	for (const path of [
		'frontend/src/page.svelte',
		'backend/src/auth.ts',
		'contracts/src/deck.ts',
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

test('shared workflow/toolchain and unknown files select every suite', () => {
	for (const path of [
		'.github/workflows/ci.yml',
		'scripts/ci-changes.mjs',
		'scripts/ci-changes.test.mjs',
		'package.json',
		'pnpm-lock.yaml',
		'pnpm-workspace.yaml',
		'frontend/.node-version',
		'worker/Dockerfile',
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

test('main/manual/unknown events and missing or invalid comparisons run all', () => {
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
