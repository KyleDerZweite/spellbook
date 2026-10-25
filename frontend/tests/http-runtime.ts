import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { getTestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const ownedProcesses = new WeakSet<ChildProcess>();

type ProcessRole = 'http' | 'api' | 'web' | 'state';
type SafeEvent = {
	role: ProcessRole;
	pid?: number;
	lifecycle: 'spawn' | 'ready' | 'stopping' | 'exit' | 'error';
	exitCode?: number | null;
	signal?: NodeJS.Signals | null;
	errorType?: string;
	sqlstate?: string;
	networkCode?: string;
};
const diagnostics = new WeakMap<ChildProcess, SafeEvent[]>();
const databaseErrors: Record<string, string> = {
	UndefinedTable: '42P01',
	UndefinedColumn: '42703',
	UniqueViolation: '23505',
	ForeignKeyViolation: '23503',
	CheckViolation: '23514',
	NotNullViolation: '23502',
	QueryCanceled: '57014',
	SerializationFailure: '40001',
	DeadlockDetected: '40P01'
};
const networkCodes = new Set([
	'ECONNREFUSED',
	'ECONNRESET',
	'ETIMEDOUT',
	'ENOTFOUND',
	'EAI_AGAIN',
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_SOCKET'
]);

/** Snapshots contain only approved fields, never raw child output. */
export function httpProcessDiagnostics(child: ChildProcess): readonly SafeEvent[] {
	return (diagnostics.get(child) ?? []).map((event) => ({ ...event }));
}

function record(child: ChildProcess, event: Omit<SafeEvent, 'role' | 'pid'>) {
	const events = diagnostics.get(child)!;
	if (events.length === 32) events.shift();
	events.push({ role: events[0]?.role ?? 'http', pid: child.pid, ...event });
}

/** Bound each unfinished line to 1024 bytes, discarding overflow through its newline. */
function capture(
	child: ChildProcess,
	role: ProcessRole,
	onLine: (line: string, stream: 'stdout' | 'stderr') => void
) {
	diagnostics.set(child, [{ role, pid: child.pid, lifecycle: 'spawn' }]);
	const context = getTestContext();
	if (context && 'after' in context)
		context.after(() => {
			if (!context.passed) context.diagnostic(JSON.stringify(httpProcessDiagnostics(child)));
		});
	for (const input of [child.stdout, child.stderr]) {
		if (!input) continue;
		let pending = Buffer.alloc(0);
		let discarding = false;
		input.on('data', (chunk: Buffer) => {
			let offset = 0;
			while (offset < chunk.length) {
				const newline = chunk.indexOf(10, offset);
				const end = newline < 0 ? chunk.length : newline;
				if (!discarding && pending.length + end - offset > 1024) {
					pending = Buffer.alloc(0);
					discarding = true;
				}
				if (!discarding) pending = Buffer.concat([pending, chunk.subarray(offset, end)]);
				if (newline < 0) break;
				if (!discarding) {
					const line = pending.toString('utf8').replace(/\r$/, '');
					onLine(line, input === child.stderr ? 'stderr' : 'stdout');
					// Exact current Python logger template. Only known type/SQLSTATE pairs survive.
					const database =
						/^Database request failed: ([A-Za-z]+) \(SQLSTATE ([A-Z0-9]{5}|None)\)$/.exec(line);
					if (role === 'api' && database) {
						const [, errorType, sqlstate] = database;
						if (Object.hasOwn(databaseErrors, errorType) && databaseErrors[errorType] === sqlstate)
							record(child, { lifecycle: 'error', errorType, sqlstate });
						else if (
							['Error', 'DatabaseError', 'OperationalError', 'InterfaceError'].includes(
								errorType
							) &&
							sqlstate === 'None'
						)
							record(child, { lifecycle: 'error', errorType });
					}
					if (role === 'web' && line.startsWith('{') && line.endsWith('}')) {
						try {
							const event = JSON.parse(line);
							if (event.event === 'proxy_failure' && event.errorType === 'UpstreamUnavailable')
								record(child, {
									lifecycle: 'error',
									errorType: 'UpstreamUnavailable',
									...(networkCodes.has(event.networkCode) ? { networkCode: event.networkCode } : {})
								});
						} catch {
							/* Unknown output is dropped. */
						}
					}
				}
				pending = Buffer.alloc(0);
				discarding = false;
				offset = newline + 1;
			}
		});
		input.once('close', () => {
			pending = Buffer.alloc(0);
		});
	}
	child.once('exit', (exitCode, signal) => record(child, { lifecycle: 'exit', exitCode, signal }));
	child.once('error', () => record(child, { lifecycle: 'error', errorType: 'ProcessError' }));
}

function processFailure(child: ChildProcess, message: string): Error {
	return new Error(
		`${message} Safe process diagnostics: ${JSON.stringify(httpProcessDiagnostics(child))}`
	);
}

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
	record(child, { lifecycle: 'stopping' });
	await new Promise<void>((resolve, reject) => {
		const exited = () => {
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(() => {
			child.off('exit', exited);
			reject(
				processFailure(
					child,
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
	env: NodeJS.ProcessEnv,
	native = false,
	role: ProcessRole = 'http'
): Promise<ChildProcess> {
	await requireFreePort(origin);
	const child = spawn(native ? entrypoint : process.execPath, native ? [] : [entrypoint], {
		cwd,
		env,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	ownedProcesses.add(child);
	let receiveLine = (_line: string) => {};
	capture(child, role, (line) => receiveLine(line));
	try {
		const stdout = child.stdout;
		if (!stdout) throw new Error('Built HTTP application has no startup output.');
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				receiveLine = () => {};
				child.off('error', failed);
				child.off('exit', exited);
			};
			const failed = () => {
				cleanup();
				reject(processFailure(child, 'Built HTTP application could not start.'));
			};
			const exited = () => {
				cleanup();
				reject(processFailure(child, 'Built HTTP application exited before listening.'));
			};
			const timer = setTimeout(() => {
				cleanup();
				reject(processFailure(child, 'Built HTTP application did not report listening.'));
			}, 10000);
			child.once('error', failed);
			child.once('exit', exited);
			receiveLine = (line) => {
				if (line !== `Listening on ${origin}` && !line.includes(`Uvicorn running on ${origin} `))
					return;
				cleanup();
				resolve();
			};
		});
		stdout.resume();
		child.stderr?.resume();
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
				reject(processFailure(child, 'Owned HTTP listener is unavailable.'));
			});
			socket.once('timeout', () => {
				socket.destroy();
				reject(processFailure(child, 'Owned HTTP listener probe timed out.'));
			});
		});
		record(child, { lifecycle: 'ready' });
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
		options.apiEntrypoint ??
			fileURLToPath(new URL('../../backend/api/.venv/bin/spellbook-api', import.meta.url)),
		{
			...process.env,
			APP_ORIGIN: origin,
			API_HOST: apiAddress.hostname,
			API_PORT: apiAddress.port,
			API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1,::1'
		},
		options.apiEntrypoint === undefined,
		'api'
	);
	try {
		const web = await startHttpProcess(
			origin,
			cwd,
			entrypoint,
			{
				...webTestEnvironment(),
				APP_ORIGIN: origin,
				API_INTERNAL_URL: apiOrigin,
				HOST: address.hostname,
				PORT: address.port,
				SOCKET_PATH: '',
				LISTEN_PID: '0',
				LISTEN_FDS: '0',
				SHUTDOWN_TIMEOUT: '1'
			},
			false,
			'web'
		);
		return { origin, apiOrigin, api, web };
	} catch (error) {
		await stopHttpProcess(api);
		throw error;
	}
}

/** This fixture owns a real independent scheduler, with installed Python and no fallback. */
export async function startStateWorker(): Promise<ChildProcess> {
	const child = spawn(
		fileURLToPath(
			new URL('../../backend/workers/state/.venv/bin/spellbook-state-worker', import.meta.url)
		),
		[],
		{
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	ownedProcesses.add(child);
	let receiveLine = (_line: string) => {};
	capture(child, 'state', (line, stream) => {
		if (stream === 'stderr') receiveLine(line);
	});
	try {
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				receiveLine = () => {};
				child.off('exit', failed);
				child.off('error', failed);
			};
			const failed = () => {
				cleanup();
				reject(processFailure(child, 'Installed state worker exited before readiness.'));
			};
			const timer = setTimeout(() => {
				cleanup();
				reject(processFailure(child, 'Installed state worker did not become ready.'));
			}, 10000);
			child.once('error', failed);
			child.once('exit', failed);
			receiveLine = (line) => {
				if (!line.endsWith('Spellbook state worker started')) return;
				cleanup();
				resolve();
			};
		});
		record(child, { lifecycle: 'ready' });
		child.stdout?.resume();
		child.stderr?.resume();
		return child;
	} catch (error) {
		await stopHttpProcess(child);
		throw error;
	}
}
