import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { createInterface } from 'node:readline';

const ownedProcesses = new WeakSet<ChildProcess>();

function testPort(rawPort: string, name: string): number {
	const port = Number(rawPort);
	if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`${name} must be a valid TCP port.`);
	}
	return port;
}

export function httpTestOrigin(env: NodeJS.ProcessEnv = process.env): string {
	const port = testPort(env.TEST_HTTP_PORT ?? '5191', 'TEST_HTTP_PORT');
	const origin = `http://127.0.0.1:${port}`;
	if (env.APP_ORIGIN && env.APP_ORIGIN !== origin) {
		throw new Error('APP_ORIGIN and TEST_HTTP_PORT must identify the same origin.');
	}
	return origin;
}

export function httpApiTestOrigin(env: NodeJS.ProcessEnv = process.env): string {
	return `http://127.0.0.1:${testPort(env.TEST_API_PORT ?? '5193', 'TEST_API_PORT')}`;
}

export function webTestEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const result: NodeJS.ProcessEnv = { BODY_SIZE_LIMIT: env.BODY_SIZE_LIMIT || '12M' };
	for (const name of [
		'PATH',
		'HOME',
		'TMPDIR',
		'TEMP',
		'TMP',
		'TZ',
		'LANG',
		'LC_ALL',
		'NODE_ENV',
		'DEMO_MODE'
	]) {
		if (env[name] !== undefined) result[name] = env[name];
	}
	for (const [name, value] of Object.entries(env)) {
		if (name.startsWith('PUBLIC_')) result[name] = value;
	}
	return result;
}

function loopbackAddress(origin: string): URL {
	const address = new URL(origin);
	if (
		address.origin !== origin ||
		address.protocol !== 'http:' ||
		address.hostname !== '127.0.0.1' ||
		!address.port
	) {
		throw new Error('HTTP test processes require an explicit loopback HTTP origin.');
	}
	return address;
}

async function requireFreePort(origin: string): Promise<void> {
	const address = loopbackAddress(origin);
	const probe = createServer();
	await new Promise<void>((resolve, reject) => {
		probe.once('error', () =>
			reject(new Error(`HTTP test port ${address.port} is unavailable or occupied.`))
		);
		probe.listen({ host: address.hostname, port: Number(address.port), exclusive: true }, () => {
			probe.close((error) => (error ? reject(error) : resolve()));
		});
	});
}

/** Stops only a child created by this fixture. Never escalates to force termination. */
export async function stopHttpProcess(child: ChildProcess): Promise<void> {
	if (!ownedProcesses.has(child)) throw new Error('Cannot stop an unowned HTTP process.');
	if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
	await new Promise<void>((resolve, reject) => {
		const exited = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			child.off('exit', exited);
			reject(
				new Error(
					'Owned HTTP application did not exit after SIGTERM. It was left running without force termination.'
				)
			);
		}, 15000);
		child.once('exit', exited);
		child.kill('SIGTERM');
	});
}

export interface HttpTestApplication {
	readonly origin: string;
	readonly apiOrigin: string;
	readonly api: ChildProcess;
	readonly web: ChildProcess;
}

export async function stopHttpApplication(application: HttpTestApplication): Promise<void> {
	const failures: unknown[] = [];
	// API shutdown closes SSE before waiting for connections and database resources.
	for (const child of [application.api, application.web]) {
		try {
			await stopHttpProcess(child);
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) throw new AggregateError(failures, 'Owned HTTP application cleanup failed.');
}

/** Low-level process fixture, also used by the runtime's ownership regression tests. */
export async function startHttpProcess(
	origin: string,
	cwd: URL,
	entrypoint: string,
	env: NodeJS.ProcessEnv
): Promise<ChildProcess> {
	await requireFreePort(origin);
	const child = spawn(process.execPath, [entrypoint], {
		cwd,
		env,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	ownedProcesses.add(child);
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
		await new Promise<void>((resolve, reject) => {
			const address = loopbackAddress(origin);
			const socket = connect({ host: address.hostname, port: Number(address.port) });
			socket.setTimeout(1000);
			socket.once('connect', () => {
				socket.destroy();
				resolve();
			});
			socket.once('error', () => {
				socket.destroy();
				reject(new Error('Owned HTTP listener is unavailable.'));
			});
			socket.once('timeout', () => {
				socket.destroy();
				reject(new Error('Owned HTTP listener probe timed out.'));
			});
		});
		return child;
	} catch (error) {
		await stopHttpProcess(child);
		throw error;
	}
}

export async function startHttpApplication(
	origin: string,
	cwd: URL,
	entrypoint = 'build/index.js',
	options: { apiOrigin?: string; apiEntrypoint?: string } = {}
): Promise<HttpTestApplication> {
	const address = loopbackAddress(origin);
	const apiOrigin = options.apiOrigin ?? httpApiTestOrigin();
	const apiAddress = loopbackAddress(apiOrigin);
	if (origin === apiOrigin) throw new Error('API and web require separate HTTP test ports.');
	// Check both before starting either child or publishing any database fixtures.
	await requireFreePort(origin);
	await requireFreePort(apiOrigin);
	const api = await startHttpProcess(
		apiOrigin,
		cwd,
		options.apiEntrypoint ?? '../backend/dist/main.js',
		{
			...process.env,
			APP_ORIGIN: origin,
			API_HOST: apiAddress.hostname,
			API_PORT: apiAddress.port,
			API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1,::1'
		}
	);
	try {
		const web = await startHttpProcess(origin, cwd, entrypoint, {
			...webTestEnvironment(),
			APP_ORIGIN: origin,
			API_INTERNAL_URL: apiOrigin,
			HOST: address.hostname,
			PORT: address.port,
			SOCKET_PATH: '',
			LISTEN_PID: '0',
			LISTEN_FDS: '0',
			SHUTDOWN_TIMEOUT: '1'
		});
		return { origin, apiOrigin, api, web };
	} catch (error) {
		await stopHttpProcess(api);
		throw error;
	}
}
