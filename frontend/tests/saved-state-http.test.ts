import { WorkspaceSavedState } from '../src/lib/saved-state/workspace.ts';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, rm, symlink } from 'node:fs/promises';
import pg from 'pg';
import { startHttpApplication, stopHttpApplication, httpTestOrigin } from './http-runtime.ts';
import { hashSessionToken } from '@spellbook/backend/auth/session.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL)
	throw Error('SavedState HTTP requires matching disposable database URLs');
const primary = httpTestOrigin();
const secondary = `http://127.0.0.1:${Number(new URL(primary).port) + 1}`;
const pool = new pg.Pool({ connectionString: databaseUrl });
const accounts: string[] = [];
const clients: Stream[] = [];
const artifacts = new URL('../../.local/saved-state-http/', import.meta.url);
const cwd = new URL('../', import.meta.url);
const children: Awaited<ReturnType<typeof startHttpApplication>>[] = [];
async function request(
	origin: string,
	path: string,
	token?: string,
	body?: unknown,
	method = body === undefined ? 'GET' : 'POST'
) {
	return fetch(origin + path, {
		method,
		headers: {
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(body !== undefined ? { 'content-type': 'application/json' } : {})
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual'
	});
}
class Stream {
	controller = new AbortController();
	events: { event: string; data: unknown; at: number }[] = [];
	ended = false;
	comments = 0;
	readonly listeners = new Map<string, Set<(event: { data: string }) => void>>();
	private waiters = new Set<() => void>();
	readonly response: Response;
	constructor(response: Response) {
		this.response = response;
		void this.read();
	}
	private async read() {
		const reader = this.response.body!.getReader(),
			decoder = new TextDecoder();
		let buffer = '';
		try {
			for (;;) {
				const part = await reader.read();
				if (part.done) break;
				buffer += decoder.decode(part.value, { stream: true });
				let boundary;
				while ((boundary = buffer.indexOf('\n\n')) !== -1) {
					const frame = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					if (frame.startsWith(':')) this.comments++;
					else {
						const event = /^event: (.+)$/m.exec(frame)?.[1];
						const data = /^data: (.+)$/m.exec(frame)?.[1];
						if (event && data) {
							this.events.push({ event, data: JSON.parse(data), at: performance.now() });
							for (const listener of this.listeners.get(event) ?? []) listener({ data });
						}
					}
					for (const wake of this.waiters) wake();
				}
			}
		} catch {
		} finally {
			this.ended = true;
			for (const wake of this.waiters) wake();
		}
	}
	async next(event: string, timeout = 3000) {
		const find = () => this.events.findIndex((item) => item.event === event);
		if (find() === -1)
			await new Promise<void>((resolve, reject) => {
				const wake = () => {
					if (find() !== -1) {
						cleanup();
						resolve();
					} else if (this.ended) {
						cleanup();
						reject(Error('Stream ended before expected event'));
					}
				};
				const timer = setTimeout(() => {
					cleanup();
					reject(Error(`Missing ${event} event`));
				}, timeout);
				const cleanup = () => {
					clearTimeout(timer);
					this.waiters.delete(wake);
				};
				this.waiters.add(wake);
				wake();
			});
		return this.events.splice(find(), 1)[0];
	}
	clear() {
		this.events = [];
	}
	close() {
		this.controller.abort();
	}
}
async function stream(origin: string, token: string) {
	const controller = new AbortController();
	const response = await fetch(origin + '/api/account/events', {
		headers: { authorization: `Bearer ${token}` },
		signal: controller.signal
	});
	assert.equal(response.status, 200);
	assert.match(response.headers.get('content-type')!, /text\/event-stream/);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.equal(response.headers.get('x-accel-buffering'), 'no');
	const result = new Stream(response);
	result.controller = controller;
	clients.push(result);
	assert.deepEqual((await result.next('reset')).data, {});
	return result;
}
async function register() {
	const username = `sync_http_${crypto.randomUUID().slice(0, 8)}`,
		password = 'saved-state-http-password';
	const response = await request(primary, '/api/auth/register', undefined, { username, password });
	assert.equal(response.status, 201);
	const value = await response.json();
	accounts.push(value.user.accountId);
	return { ...value, username, password };
}
async function delay(ms: number) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
async function listenerPid(child: (typeof children)[number]) {
	const result = await pool.query('SELECT pid FROM pg_stat_activity WHERE application_name=$1', [
		`spellbook_saved_state:${child.pid}`
	]);
	assert.equal(result.rowCount, 1);
	return result.rows[0].pid;
}
test('real two-process saved Profile streaming and session lifecycle', async (t) => {
	try {
		await mkdir(artifacts, { recursive: true });
		await rm(new URL('node_modules', artifacts), { force: true });
		await symlink(
			new URL('node_modules/', cwd).pathname,
			new URL('node_modules', artifacts),
			'dir'
		);
		for (const [index, origin] of [primary, secondary].entries()) {
			const build = spawnSync('pnpm', ['build'], {
				cwd,
				env: { ...process.env, APP_ORIGIN: origin },
				stdio: ['ignore', 'pipe', 'pipe']
			});
			assert.equal(build.status, 0, 'Origin-matched production build must succeed');
			const target = new URL(`${index}/`, artifacts);
			await rm(target, { recursive: true, force: true });
			await cp(new URL('build/', cwd), target, { recursive: true });
			children.push(await startHttpApplication(origin, cwd, `${target.pathname}index.js`));
		}
		const a = await register(),
			b = await register();
		const login = await (
			await request(primary, '/api/auth/login', undefined, {
				username: a.username,
				password: a.password
			})
		).json();
		const one = await stream(primary, a.token),
			two = await stream(secondary, a.token),
			other = await stream(primary, b.token),
			independent = await stream(primary, login.token);
		await t.test(
			'auth handshake, explicit bearer precedence, origin policy and no URL credentials',
			async () => {
				for (const authorization of ['', 'Basic abc', 'Bearer wrong', 'Bearer ' + 'a'.repeat(43)]) {
					const result = await fetch(primary + '/api/account/events', {
						headers: { authorization, cookie: `spellbook_session=${a.token}` }
					});
					assert.equal(result.status, 401);
				}
				assert.equal((await fetch(primary + '/api/account/events')).status, 401);
				for (const origin of ['https://foreign.example', 'null'])
					assert.equal(
						(
							await fetch(primary + '/api/account/events', {
								headers: { origin, authorization: `Bearer ${a.token}` }
							})
						).status,
						403
					);
				assert.equal(
					(
						await fetch(primary + '/api/account/events?token=forbidden-url-credential', {
							headers: { authorization: `Bearer ${a.token}` }
						})
					).status,
					400
				);
				const cookieResponse = await fetch(primary + '/api/account/events', {
					headers: { cookie: `spellbook_session=${a.token}`, origin: primary }
				});
				assert.equal(cookieResponse.status, 200);
				await cookieResponse.body?.cancel();
				const bearer = await fetch(primary + '/api/account/events', {
					headers: { cookie: `spellbook_session=${b.token}`, authorization: `Bearer ${a.token}` }
				});
				assert.equal(bearer.status, 200);
				await bearer.body?.cancel();
			}
		);
		await t.test(
			'one listener per process with many streams; direct trigger commit/rollback and account isolation',
			async () => {
				await listenerPid(children[0]);
				await listenerPid(children[1]);
				one.clear();
				two.clear();
				other.clear();
				independent.clear();
				const tx = await pool.connect();
				try {
					await tx.query('BEGIN');
					await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
						a.user.accountId,
						'rollback-private-marker@example.test'
					]);
					await delay(200);
					assert.equal(one.events.length, 0);
					await tx.query('ROLLBACK');
					await delay(200);
					assert.equal(one.events.length, 0);
					const committedAt = performance.now();
					await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
						a.user.accountId,
						'committed-private-marker@example.test'
					]);
					for (const client of [one, two, independent]) {
						const event = await client.next('invalidate');
						assert.deepEqual(event.data, { topics: ['profile'] });
						assert.ok(event.at - committedAt < 2000);
					}
					assert.equal(other.events.length, 0);
					const saved = await (await request(secondary, '/api/account/profile', a.token)).json();
					assert.equal(saved.user.email, 'committed-private-marker@example.test');
				} finally {
					tx.release();
				}
			}
		);
		await t.test(
			'cross-process field patches refetch current saved selections within healthy target',
			async () => {
				one.clear();
				two.clear();
				const at = performance.now();
				assert.equal(
					(
						await request(
							secondary,
							'/api/account/profile',
							a.token,
							{ avatarId: 'dragon', artworkId: 'tide' },
							'PATCH'
						)
					).status,
					200
				);
				await one.next('invalidate');
				const saved = await (await request(primary, '/api/account/profile', a.token)).json();
				assert.equal(saved.user.avatarId, 'dragon');
				assert.equal(saved.user.artworkId, 'tide');
				assert.ok(performance.now() - at < 2000);
			}
		);
		await t.test(
			'workspace resource leases apply cross-replica Inventory and Deck totals with counted write settlement',
			async () => {
				const owned = await stream(primary, a.token);
				const bridge = {
					readyState: 1,
					close: () => owned.close(),
					addEventListener(name: string, listener: (event: { data: string }) => void) {
						let listeners = owned.listeners.get(name);
						if (!listeners) {
							listeners = new Set();
							owned.listeners.set(name, listeners);
						}
						listeners.add(listener);
					},
					onerror: null as (() => void) | null
				};
				const workspace = new WorkspaceSavedState({
					source: () => bridge,
					session: async (signal) =>
						(
							await fetch(primary + '/api/auth/session', {
								headers: { authorization: `Bearer ${a.token}` },
								signal
							})
						).status,
					visible: () => true,
					listen: () => () => {},
					changed() {}
				});
				let totals = 0,
					deckCount = 0,
					reads = 0;
				workspace.start({ accountId: a.user.accountId, activation: 'http-owned' });
				workspace.subscribe({
					topics: ['inventory', 'decks', 'profile'],
					clear() {
						totals = 0;
						deckCount = 0;
					},
					refresh: async (lease) => {
						reads++;
						const response = await fetch(primary + '/api/account/profile', {
							headers: { authorization: `Bearer ${a.token}` },
							signal: lease.signal
						});
						const value = await response.json();
						if (lease.current()) {
							totals = value.totals.total;
							deckCount = value.totals.decks;
						}
					}
				});
				for (const listener of owned.listeners.get('reset') ?? []) listener({ data: '{}' });
				const wait = async (check: () => boolean) => {
					const deadline = performance.now() + 2000;
					while (!check() && performance.now() < deadline) await delay(10);
					assert.ok(check(), 'Current saved resource must apply within healthy target');
				};
				await wait(() => reads > 0);
				const card = await ensureDeckCatalogFixture(pool);
				const inventoryAt = performance.now();
				const receipt = await request(secondary, '/api/mobile/v1/mtg/inventory', a.token, {
					requestId: crypto.randomUUID(),
					source: 'mobile',
					items: [
						{ catalogCardId: card.catalogCardId, quantity: 2, finish: 'nonfoil', condition: 'NM' }
					]
				});
				assert.equal(receipt.status, 200);
				await wait(() => totals === 2);
				assert.ok(performance.now() - inventoryAt < 2000);

				const deckAt = performance.now();
				const deck = await request(secondary, '/api/mobile/v1/mtg/decks', a.token, {
					requestId: crypto.randomUUID(),
					name: 'Streaming owned deck',
					format: 'Commander',
					description: ''
				});
				assert.equal(deck.status, 200);
				await wait(() => deckCount === 1);
				assert.ok(performance.now() - deckAt < 2000);
				let scanId: string | undefined,
					scanCount = 0,
					scanStatus = '';
				const scanResource = workspace.subscribe({
					topics: ['scan'],
					clear() {
						scanId = undefined;
						scanCount = 0;
						scanStatus = '';
					},
					refresh: async (lease) => {
						const id = scanId;
						const list = await request(primary, '/api/mobile/v1/mtg/scan/sessions', a.token);
						assert.equal(list.status, 200);
						const value = await list.json();
						if (lease.current()) scanCount = value.sessions.length;
						if (id) {
							const response = await request(
								primary,
								`/api/mobile/v1/mtg/scan/sessions/${id}/result`,
								a.token
							);
							assert.equal(response.status, 200);
							const result = await response.json();
							if (lease.current() && scanId === id) scanStatus = result.lastResult?.status ?? '';
						}
					}
				});
				const scanAt = performance.now();
				const created = await request(secondary, '/api/mobile/v1/mtg/scan/sessions', a.token, {});
				assert.equal(created.status, 200);
				scanId = (await created.json()).session.id;
				scanResource.invalidate();
				await wait(() => scanCount === 1);
				const image = new FormData();
				image.set(
					'file',
					new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
					'workspace.png'
				);
				const uploaded = await fetch(
					secondary + `/api/mobile/v1/mtg/scan/sessions/${scanId}/frames`,
					{ method: 'POST', headers: { authorization: `Bearer ${a.token}` }, body: image }
				);
				assert.equal(uploaded.status, 200);
				await wait(() => scanStatus === 'no_match');
				assert.ok(performance.now() - scanAt < 2000);
				const before = reads;
				const handle = workspace.beginWrite(['inventory']);
				owned.clear();
				for (let i = 0; i < 10; i++) workspace.invalidate(['inventory']);
				await delay(30);
				assert.equal(reads, before);
				handle.complete();
				await wait(() => reads > before);

				workspace.stop();
				assert.equal(totals, 0);
				assert.equal(deckCount, 0);
			}
		);
		await t.test(
			'paused TCP consumption reaches backpressure without blocking healthy fanout',
			async () => {
				const credentials = await (
					await request(primary, '/api/auth/login', undefined, {
						username: a.username,
						password: a.password
					})
				).json();

				const probe = spawn(
					'python3',
					[new URL('./fixtures/paused-sse-client.py', import.meta.url).pathname],
					{ stdio: ['pipe', 'pipe', 'pipe'] }
				);
				probe.stderr.resume();
				const output = createInterface({ input: probe.stdout });
				const lines: string[] = [];
				output.on('line', (line) => lines.push(line));
				probe.stdin.write(
					JSON.stringify({ port: Number(new URL(primary).port), token: credentials.token }) + '\n'
				);
				const ready = await new Promise<{ port: number; receiveBuffer: number }>(
					(resolve, reject) => {
						output.once('line', (line) => resolve(JSON.parse(line)));
						probe.once('exit', () => reject(Error('Paused TCP probe exited before ready')));
					}
				);
				assert.equal(ready.receiveBuffer, 8192);
				const peerPort = ready.port;

				let observedBackpressure = false,
					iterations = 0;
				let previousQueue = 0,
					plateau = 0;
				one.clear();
				try {
					for (; iterations < 60000; iterations++) {
						await pool.query('SELECT pg_notify($1,$2)', [
							'spellbook_saved_state',
							JSON.stringify({ accountId: a.user.accountId, topic: 'profile' })
						]);
						await one.next('invalidate');
						if (iterations % 250 === 0) {
							two.clear();
							independent.clear();
							const report = execFileSync(
								'ss',
								['-tin', `( sport = :${new URL(primary).port} and dport = :${peerPort} )`],
								{ encoding: 'utf8' }
							);
							const sendQueue = Number(/^ESTAB\s+\d+\s+(\d+)/m.exec(report)?.[1] ?? 0);
							if (sendQueue > 131072 && Math.abs(sendQueue - previousQueue) < 4096) plateau++;
							else plateau = 0;
							previousQueue = sendQueue;
							if (plateau >= 4) {
								observedBackpressure = true;
								break;
							}
						}
					}
					assert.equal(
						observedBackpressure,
						true,
						'Must fill the paused TCP window; an unread fetch is insufficient'
					);
					one.clear();
					const at = performance.now();
					assert.equal(
						(
							await request(
								secondary,
								'/api/account/profile',
								a.token,
								{ artworkId: 'astral' },
								'PATCH'
							)
						).status,
						200
					);
					await one.next('invalidate');
					assert.ok(performance.now() - at < 2000);
					await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [
						hashSessionToken(credentials.token)
					]);

					await pool.query('SELECT pg_notify($1,$2)', [
						'spellbook_saved_state',
						JSON.stringify({ accountId: a.user.accountId, topic: 'scan' })
					]);
					const closed = new Promise<void>((resolve, reject) =>
						probe.once('exit', (code) =>
							code === 0 ? resolve() : reject(Error('Paused TCP probe failed'))
						)
					);
					probe.stdin.end('resume\n');
					let timeout: ReturnType<typeof setTimeout> | undefined;
					try {
						await Promise.race([
							closed,
							new Promise<never>((_, reject) => {
								timeout = setTimeout(
									() => reject(Error('Paused revoked socket did not settle after resuming')),
									5000
								);
							})
						]);
					} finally {
						clearTimeout(timeout);
					}
					const terminal = JSON.parse(lines[1]);
					assert.equal(terminal.authExpired, true);
					assert.equal(terminal.protectedAfterTerminal, false);
					assert.equal(terminal.postRevocationTopic, false);

					assert.equal(
						(await request(primary, '/api/account/events', credentials.token)).status,
						401
					);
					t.diagnostic(
						`Paused TCP window/backpressure plateau ${previousQueue}bytes after ${iterations + 1} committed signals; SO_RCVBUF4096/Linux8192; healthy client remained below2s.`
					);
				} finally {
					probe.kill();
					output.close();
					one.clear();
					two.clear();
					independent.clear();
				}
			}
		);
		await t.test(
			'listener recovery rejects missed revocation before protected fanout resumes',
			async () => {
				one.clear();
				independent.clear();
				const pid = await listenerPid(children[0]);
				await pool.query('SELECT pg_terminate_backend($1)', [pid]);
				await one.next('recovering');
				await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [
					hashSessionToken(a.token)
				]);
				await pool.query('UPDATE user_profiles SET avatar_id=$2 WHERE account_id=$1', [
					a.user.accountId,
					'knight'
				]);
				assert.deepEqual((await one.next('auth-expired')).data, {});
				assert.deepEqual((await two.next('auth-expired')).data, {});
				await independent.next('reset');
				assert.equal(one.events.filter((e) => e.event === 'invalidate').length, 0);
				assert.equal((await request(primary, '/api/account/events', a.token)).status, 401);
				assert.notEqual(await listenerPid(children[0]), pid);
				const saved = await (await request(primary, '/api/account/profile', login.token)).json();
				assert.equal(saved.user.avatarId, 'knight');
			}
		);
		await t.test(
			'expiry, logout, password rotation and replica reconnect preserve independent authority',
			async () => {
				const short = await (
					await request(primary, '/api/auth/login', undefined, {
						username: a.username,
						password: a.password
					})
				).json();
				await pool.query(
					"UPDATE auth_sessions SET expires_at=now()+interval '500 milliseconds' WHERE token_hash=$1",
					[hashSessionToken(short.token)]
				);
				const expiring = await stream(secondary, short.token);
				await expiring.next('auth-expired');
				assert.equal((await request(primary, '/api/account/events', short.token)).status, 401);
				const third = await (
					await request(primary, '/api/auth/login', undefined, {
						username: a.username,
						password: a.password
					})
				).json();
				const loggedOut = await stream(secondary, third.token);
				assert.equal((await request(primary, '/api/auth/logout', third.token, {})).status, 204);
				await loggedOut.next('auth-expired');
				assert.equal((await request(primary, '/api/auth/session', login.token)).status, 200);
				const oldReplica = await stream(secondary, login.token);
				const failed = await request(primary, '/api/account/password', login.token, {
					currentPassword: 'wrong-password',
					newPassword: 'saved-state-new-password'
				});
				assert.equal(failed.status, 400);
				const rotation = await request(secondary, '/api/account/password', login.token, {
					currentPassword: a.password,
					newPassword: 'saved-state-new-password'
				});
				assert.equal(rotation.status, 200);
				const replacement = await rotation.json();
				await independent.next('auth-expired');
				await oldReplica.next('auth-expired');
				const reconnected = await stream(primary, replacement.token);
				reconnected.close();
				assert.equal(
					(
						await request(
							secondary,
							'/api/account/profile',
							replacement.token,
							{ artworkId: 'ember' },
							'PATCH'
						)
					).status,
					200
				);
				const switched = await stream(secondary, replacement.token);
				const latest = await (
					await request(secondary, '/api/account/profile', replacement.token)
				).json();
				assert.equal(latest.user.artworkId, 'ember');
				assert.equal(other.ended, false);
				switched.close();
			}
		);
		await t.test('idle heartbeat and repeated stream abort retain listener ownership', async () => {
			const baseline = other.comments;
			await delay(15500);
			assert.ok(other.comments > baseline);
			assert.equal(other.ended, false);
			for (let i = 0; i < 12; i++) {
				const transient = await stream(primary, b.token);
				transient.close();
			}
			await delay(100);
			await listenerPid(children[0]);
			await listenerPid(children[1]);
		});
		await t.test(
			'controlled local reverse proxy streams across idle heartbeats and cleans aborted clients',
			async () => {
				let active = 0;
				const proxy = createServer((incoming, outgoing) => {
					active++;
					const upstream = httpRequest(
						new URL(incoming.url!, primary),
						{
							method: incoming.method,
							headers: { ...incoming.headers, host: new URL(primary).host }
						},
						(response) => {
							outgoing.writeHead(response.statusCode!, response.headers);
							response.pipe(outgoing);
						}
					);
					upstream.on('error', () => {
						if (!outgoing.headersSent) outgoing.writeHead(502);
						outgoing.end();
					});
					outgoing.once('close', () => {
						active--;
						upstream.destroy();
					});
					incoming.pipe(upstream);
				});
				proxy.timeout = 22000;
				await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
				const address = proxy.address();
				assert.ok(address && typeof address !== 'string');
				const proxyOrigin = `http://127.0.0.1:${address.port}`;
				let forwarded: Stream | undefined;
				try {
					const start = performance.now();
					forwarded = await stream(proxyOrigin, b.token);
					assert.ok(performance.now() - start < 2000);
					const comments = forwarded.comments;
					await delay(31000);
					assert.ok(forwarded.comments >= comments + 2);
					assert.equal(forwarded.ended, false);
					forwarded.clear();
					const at = performance.now();
					assert.equal(
						(
							await request(
								secondary,
								'/api/account/profile',
								b.token,
								{ avatarId: 'ranger' },
								'PATCH'
							)
						).status,
						200
					);
					assert.deepEqual((await forwarded.next('invalidate')).data, { topics: ['profile'] });
					assert.ok(performance.now() - at < 2000);
					const cookie = await fetch(proxyOrigin + '/api/account/events', {
						headers: { cookie: `spellbook_session=${b.token}` }
					});
					assert.equal(cookie.status, 200);
					await cookie.body?.cancel();
					forwarded.close();
					await delay(100);
					assert.equal(active, 0);
				} finally {
					forwarded?.close();
					proxy.closeAllConnections();
					await new Promise<void>((resolve) => proxy.close(() => resolve()));
				}
				t.diagnostic(
					'Controlled local proxy idle timeout22s exceeded across two15s heartbeats without buffering; deployment proxy remains separate.'
				);
			}
		);
	} finally {
		for (const client of clients) client.close();
		for (const child of children) await stopHttpApplication(child);
		if (accounts.length)
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		await pool.end();
	}
});
