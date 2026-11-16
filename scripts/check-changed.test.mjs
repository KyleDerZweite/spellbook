import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPaths } from './ci-changes.mjs';
import { exitCode, runSteps } from './ci-checks.mjs';
import { changedPaths, selectEntries } from './check-changed.mjs';

const script = fileURLToPath(new URL('./check-changed.mjs', import.meta.url));

function repository(callback) {
	const cwd = mkdtempSync(join(tmpdir(), 'spellbook-check-changed-'));
	const git = (...args) =>
		execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	const write = (path, content = 'fixture\n') => {
		mkdirSync(join(cwd, path, '..'), { recursive: true });
		writeFileSync(join(cwd, path), content);
	};
	const commit = () => {
		git('add', '-A');
		git('-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'x');
	};
	try {
		git('init', '-q', '-b', 'main');
		write('backend/core/kept.py');
		write('frontend/src/deleted.ts');
		commit();
		git('switch', '-qc', 'topic');
		callback({ cwd, git, write, commit });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

test('changed paths include committed, staged, unstaged, deleted and untracked files', () => {
	repository(({ cwd, git, write, commit }) => {
		write('backend/workers/catalog/committed.py');
		commit();
		write('contracts/staged.json');
		git('add', 'contracts/staged.json');
		write('backend/core/kept.py', 'changed\n');
		unlinkSync(join(cwd, 'frontend/src/deleted.ts'));
		write('backend/workers/scan/untracked.py');
		assert.deepEqual(changedPaths(cwd, 'main').paths.sort(), [
			'backend/core/kept.py',
			'backend/workers/catalog/committed.py',
			'backend/workers/scan/untracked.py',
			'contracts/staged.json',
			'frontend/src/deleted.ts'
		]);
	});
});

test('entries follow the CI job conditions', () => {
	const select = (path) => selectEntries(classifyPaths([path]));
	assert.deepEqual(select('docs/README.md'), ['scope']);
	assert.deepEqual(select('frontend/src/app.html'), ['scope', 'application']);
	assert.deepEqual(select('backend/core/src/module.py'), ['scope', 'python-backend']);
	assert.deepEqual(select('backend/workers/scan/main.py'), ['scope', 'application', 'workers']);
	assert.deepEqual(select('scripts/ci-checks.mjs'), [
		'scope',
		'application',
		'python-backend',
		'workers'
	]);
});

const node = (code) => `node -e "process.exit(${code})"`;

test('failures fail the run and missing tools or services are reported as not run', () => {
	const env = { PATH: process.env.PATH };
	const outcomes = runSteps(
		[
			{ cwd: '.', run: [node(0)] },
			{ name: 'red', cwd: '.', run: [node(3), node(0)] },
			{
				name: 'db',
				cwd: '.',
				run: [node(0)],
				requires: { env: 'MISSING_URL', reason: 'needs PG' }
			},
			{ name: 'tool', cwd: '.', run: ['missing-tool-for-test --version'] }
		],
		{ cwd: process.cwd(), env, log: () => {} }
	);
	assert.deepEqual(outcomes, [
		{ name: node(0), status: 'passed' },
		{ name: 'red', status: 'failed', reason: `${node(3)}: exit 3` },
		{ name: 'db', status: 'not run', reason: 'MISSING_URL is not set; needs PG' },
		{ name: 'tool', status: 'not run', reason: 'missing-tool-for-test is not on PATH' }
	]);
	assert.equal(exitCode(outcomes, { strict: false }), 1);
	assert.equal(exitCode(outcomes.slice(2), { strict: false }), 0);
	assert.equal(exitCode(outcomes.slice(2), { strict: true }), 1);
	const log = [];
	runSteps([{ cwd: '.', run: [node(0)] }], {
		cwd: process.cwd(),
		env: { ...env, GITHUB_ACTIONS: 'true' },
		log: (line) => log.push(line)
	});
	assert.deepEqual(log, [`::group::${node(0)}`, '::endgroup::']);
});

test('the command lists a selection and rejects bad arguments', () => {
	repository(({ cwd, write }) => {
		write('docs/guide.md');
		const listed = spawnSync(process.execPath, [script, '--list', 'main'], {
			cwd,
			encoding: 'utf8'
		});
		assert.equal(listed.status, 0, listed.stderr);
		assert.match(
			listed.stdout,
			/Scopes: none\n\nscope\n {2}\[\.\] node --test scripts\/docs\.test\.mjs/
		);
		for (const args of [['main', 'other'], ['--unknown'], ['no-such-ref']])
			assert.equal(spawnSync(process.execPath, [script, ...args], { cwd }).status, 2, args.join());
	});
});
