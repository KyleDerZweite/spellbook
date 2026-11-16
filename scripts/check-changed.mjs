// Runs the CI check entries that the working tree's changes select.
// Usage: pnpm check:changed [--list] [<ref>]   (default ref: origin/main)
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyPaths } from './ci-changes.mjs';
import { entries, exitCode, runSteps } from './ci-checks.mjs';

const notCovered =
	'Not covered: the manual Application Integration and Android Build workflows, browser, PWA and ' +
	'QR checks, container builds and deployment (docs/operations/github-automation.md).';

const git = (cwd, ...args) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Committed, uncommitted and untracked paths since the merge base with `ref`.
export function changedPaths(cwd, ref) {
	const base = git(cwd, 'merge-base', 'HEAD', ref).trim();
	const tracked = git(cwd, 'diff', '--name-only', '--no-renames', '-z', base, '--');
	const untracked = git(cwd, 'ls-files', '--others', '--exclude-standard', '-z');
	return { base, paths: [...new Set(`${tracked}${untracked}`.split('\0').filter(Boolean))] };
}

// Mirrors the job `if` conditions in ci.yml; CI Scope always runs.
export const selectEntries = (scopes) =>
	[
		'scope',
		scopes.application && 'application',
		scopes.python_backend && 'python-backend',
		(scopes.worker || scopes.scan_worker) && 'workers'
	].filter(Boolean);

function main(args) {
	const list = args.includes('--list');
	const refs = args.filter((arg) => arg !== '--list');
	if (refs.length > 1 || refs.some((arg) => arg.startsWith('-'))) {
		console.error('Usage: pnpm check:changed [--list] [<ref>]');
		return 2;
	}
	const ref = refs[0] ?? 'origin/main';
	const cwd = git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
	const { base, paths } = changedPaths(cwd, ref);
	const scopes = classifyPaths(paths);
	const selected = Object.keys(scopes).filter((scope) => scopes[scope]);
	console.log(`${paths.length} changed paths against ${ref} (merge base ${base.slice(0, 12)})`);
	console.log(`Scopes: ${selected.join(', ') || 'none'}`);
	const outcomes = [];
	for (const entry of selectEntries(scopes)) {
		const steps = entries[entry](scopes);
		if (list) {
			console.log(`\n${entry}`);
			for (const { cwd: directory, run } of steps)
				for (const command of run) console.log(`  [${directory}] ${command}`);
		} else outcomes.push(...runSteps(steps, { cwd }).map((outcome) => ({ entry, ...outcome })));
	}
	if (!list) {
		console.log(`\nSummary for scopes: ${selected.join(', ') || 'none'}`);
		for (const { entry, name, status, reason } of outcomes)
			console.log(`  ${status.padEnd(7)}  ${entry}: ${name}${reason ? ` (${reason})` : ''}`);
		const incomplete = outcomes.some(({ status }) => status === 'not run');
		const result = exitCode(outcomes, { strict: false }) ? 'failed' : 'passed';
		console.log(`Result: ${result}${incomplete ? ', but not every step ran' : ''}`);
	}
	console.log(`\n${notCovered}`);
	return list ? 0 : exitCode(outcomes, { strict: false });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		console.error(`check:changed: ${error.stderr?.trim() || error.message}`);
		process.exitCode = 2;
	}
}
