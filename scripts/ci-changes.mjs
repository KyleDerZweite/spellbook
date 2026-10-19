import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const all = () => ({ application: true, worker: true, scan_worker: true, android: true });

export function classifyPaths(paths) {
	const checks = { application: false, worker: false, scan_worker: false, android: false };
	for (const path of paths) {
		if (
			path.startsWith('docs/') ||
			/^[^/]+\.md$/.test(path) ||
			/^(frontend|backend|contracts|worker|scan-worker|android)\/README\.md$/.test(path) ||
			['LICENSE', 'NOTICE'].includes(path)
		)
			continue;
		if (
			path.startsWith('.github/') ||
			path.startsWith('scripts/ci-changes') ||
			path === '.dockerignore'
		)
			return all();
		if (
			['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'frontend/.node-version'].includes(
				path
			)
		) {
			checks.application = true;
			continue;
		}
		if (path.startsWith('backend/drizzle/') || path.startsWith('frontend/drizzle/')) {
			checks.application = true;
			checks.worker = true;
		} else if (path.startsWith('android/')) checks.android = true;
		else if (path.startsWith('contracts/')) {
			checks.application = true;
			checks.android = true;
		} else if (path.startsWith('worker/')) checks.worker = true;
		else if (path.startsWith('scan-worker/')) {
			checks.application = true;
			checks.scan_worker = true;
		} else if (/^(frontend|backend|contracts|scripts)\//.test(path)) checks.application = true;
		else return all();
	}
	return checks;
}

export function selectChecks({ eventName, base, head, cwd = process.cwd() }) {
	if (
		!['pull_request', 'push'].includes(eventName) ||
		!/^[a-f\d]{40}$/i.test(base ?? '') ||
		!/^[a-f\d]{40}$/i.test(head ?? '')
	)
		return all();
	try {
		// Disabling renames exposes both the old and new paths. NUL preserves unusual filenames.
		const changed = execFileSync(
			'git',
			[
				'diff',
				'--name-only',
				'--no-renames',
				'-z',
				`${base}${eventName === 'pull_request' ? '...' : '..'}${head}`
			],
			{
				cwd,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		return classifyPaths(changed.split('\0').filter(Boolean));
	} catch {
		// An unavailable comparison must never silently skip a suite.
		return all();
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const checks = selectChecks({
		eventName: process.env.CI_EVENT_NAME,
		base: process.env.CI_BASE_SHA,
		head: process.env.CI_HEAD_SHA
	});
	if (process.env.GITHUB_OUTPUT)
		appendFileSync(
			process.env.GITHUB_OUTPUT,
			Object.entries(checks)
				.map(([key, value]) => `${key}=${value}\n`)
				.join('')
		);
	console.log(JSON.stringify(checks));
}
