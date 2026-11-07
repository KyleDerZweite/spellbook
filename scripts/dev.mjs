import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export function developmentPlan(configured, environment, action = 'up') {
	if (!['up', 'down'].includes(action)) throw new Error('Usage: pnpm dev or pnpm dev:stop');
	const env = { ...environment };
	const args = [];
	if (configured) {
		args.push('--env-file', '.env');
	} else {
		const port = env.DEV_LOCAL_PORT || '3000';
		if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
			throw new Error('DEV_LOCAL_PORT must be a TCP port between 1 and 65535.');
		env.DEV_LOCAL_PORT = String(Number(port));
		env.DEV_APP_ORIGIN = new URL(`http://localhost:${env.DEV_LOCAL_PORT}`).origin;
	}
	args.push('-p', configured ? 'spellbook-dev' : 'spellbook-dev-local');
	args.push('-f', 'compose.development.yml');
	args.push('-f', configured ? 'compose.development-tunnel.yml' : 'compose.development-local.yml');
	if (configured) args.push('--profile', 'tunnel');
	args.push(...(action === 'up' ? ['up', '--build', '-d'] : ['down']));
	return { args, env };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	try {
		const configured = existsSync(new URL('../.env', import.meta.url));
		const plan = developmentPlan(configured, process.env, process.argv[2]);
		const result = spawnSync('podman-compose', plan.args, {
			cwd: root,
			env: plan.env,
			stdio: 'inherit'
		});
		if (result.error) throw new Error('Could not run podman-compose. Check that it is installed.');
		process.exitCode = result.status ?? 1;
	} catch (cause) {
		console.error(cause.message);
		process.exitCode = 1;
	}
}
