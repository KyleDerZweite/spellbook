import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';

export function httpTestOrigin(env: NodeJS.ProcessEnv = process.env): string {
	const rawPort = env.TEST_HTTP_PORT ?? '5191';
	const port = Number(rawPort);
	if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('TEST_HTTP_PORT must be a valid TCP port.');
	}
	const origin = `http://127.0.0.1:${port}`;
	if (env.APP_ORIGIN && env.APP_ORIGIN !== origin) {
		throw new Error('APP_ORIGIN and TEST_HTTP_PORT must identify the same origin.');
	}
	return origin;
}

export async function stopHttpApplication(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(
				new Error(
					'Owned HTTP application did not exit after SIGTERM. It was left running without force termination.'
				)
			);
		}, 5000);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill('SIGTERM');
	});
}

export async function startHttpApplication(
	origin: string,
	cwd: URL,
	entrypoint = 'build/index.js'
): Promise<ChildProcess> {
	const address = new URL(origin);
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once('error', () => reject(new Error('HTTP test port is unavailable or occupied.')));
		probe.listen({ host: address.hostname, port: Number(address.port), exclusive: true }, () => {
			probe.close((error) => (error ? reject(error) : resolve()));
		});
	});
	const child = spawn(process.execPath, [entrypoint], {
		cwd,
		env: {
			...process.env,
			HOST: address.hostname,
			PORT: address.port,
			SOCKET_PATH: '',
			LISTEN_PID: '0',
			LISTEN_FDS: '0',
			SHUTDOWN_TIMEOUT: '1'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stderr?.resume();
	try {
		const stdout = child.stdout;
		if (!stdout) throw new Error('Built HTTP application has no startup output.');
		await new Promise<void>((resolve, reject) => {
			const lines = createInterface({ input: stdout });
			const cleanup = () => {
				clearTimeout(timer);
				lines.close();
				child.off('error', failed);
				child.off('exit', exited);
			};
			const failed = () => {
				cleanup();
				reject(new Error('Built HTTP application could not start.'));
			};
			const exited = () => {
				cleanup();
				reject(new Error('Built HTTP application exited before listening.'));
			};
			const timer = setTimeout(() => {
				cleanup();
				reject(new Error('Built HTTP application did not report listening.'));
			}, 10000);
			child.once('error', failed);
			child.once('exit', exited);
			lines.on('line', (line) => {
				if (line !== `Listening on ${origin}`) return;
				cleanup();
				resolve();
			});
		});
		stdout.resume();
		return child;
	} catch (error) {
		await stopHttpApplication(child);
		throw error;
	}
}
