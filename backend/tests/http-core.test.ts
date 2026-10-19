import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import type { Application } from '../src/application.ts';
import { createHttpApplication } from '../src/http/application.ts';
import { requireMobileAuth } from '../src/http/auth.ts';
import { error, errorResponse, HttpError, json } from '../src/http/errors.ts';
import { createNodeHttpServer, parseTrustedProxyAddresses } from '../src/http/node.ts';
import { createRouter } from '../src/http/router.ts';
import { createAuthRoutes } from '../src/http/routes/auth.ts';
import { createAccountRoutes } from '../src/http/routes/account.ts';
import { createSavedStateRoutes } from '../src/http/routes/saved-state.ts';
import { savedStateBody } from '../src/http/saved-state.ts';
import {
	readJsonObject,
	readQueryInteger,
	readRequestBytes,
	readString,
	readNumber,
	requireUuid
} from '../src/http/request.ts';
import type { HttpApplication, HttpDependencies } from '../src/http/types.ts';
import {
	NotesConflictError,
	DescriptionConflictError,
	InventoryQuantityChangedError,
	RequestConflictError
} from '../src/transport.ts';
import { ProfileError } from '../src/profile/profile.ts';
import { SummaryRangeError } from '../src/profile/summary-number.ts';
import type { SavedStateSubscription } from '@spellbook/contracts/saved-state.ts';
import type { Authenticated, AuthSession } from '@spellbook/contracts/auth.ts';

const origin = 'https://spellbook.example';
const token = 'a'.repeat(43);
const replacement = 'b'.repeat(43);
const code = 'c'.repeat(43);
const secret = 's'.repeat(43);
const user = { accountId: '00000000-0000-4000-8000-000000000001', username: 'reader', email: '' };
const expiresAt = '2030-01-01T00:00:00.000Z';

function fixture() {
	const seen: unknown[] = [];
	const auth = {
		async validateSession(value: string | undefined) {
			seen.push(value);
			return value === token ? user : null;
		},
		async requireActor(actor: unknown) {
			assert.equal(actor, user);
			return user;
		},
		async inspectSession(value: string | undefined) {
			return value === token ? { user, expiresAt } : null;
		},
		takeAuthAttempt(value: string) {
			seen.push({ address: value });
		},
		async authenticate(...args: unknown[]): Promise<Authenticated | null> {
			seen.push({ authenticate: args });
			return { user, session: { token, expiresAt } };
		},
		async revokeSession(value: string) {
			seen.push({ revoke: value });
		},
		async changePassword(actor: unknown): Promise<AuthSession | null> {
			assert.equal(actor, user);
			seen.push('changePassword');
			return { token: replacement, expiresAt };
		},
		qr: {
			async create(kind: 'browser' | 'device') {
				return { code, kind, requesterSecret: secret, expiresAt, interval: 3 };
			},
			async inspect(actor: unknown) {
				assert.equal(actor, user);
				return { code, kind: 'browser', expiresAt, status: 'pending' };
			},
			async decide(actor: unknown) {
				assert.equal(actor, user);
				return { code, kind: 'browser', expiresAt, status: 'approved' };
			},
			async redeem(_code: string, requester: { browserSecret?: string; requesterSecret?: string }) {
				seen.push(requester);
				return {
					status: 'authenticated',
					kind: requester.browserSecret ? 'browser' : 'device',
					session: { token: replacement, expiresAt }
				};
			}
		}
	};
	const profile = {
		async get(actor: unknown) {
			assert.equal(actor, user);
			return { user, card: null, totals: null, statsError: null };
		},
		async patch(actor: unknown, input: unknown) {
			assert.equal(actor, user);
			seen.push(input);
			return { user };
		}
	};
	const dashboard = {
		async get(actor: unknown) {
			assert.equal(actor, user);
			return { inventory: { quantity: 2 } };
		}
	};
	const application = { auth, profile, dashboard } as unknown as Application;
	const dependencies: HttpDependencies = { application, publicOrigin: origin };
	return {
		application,
		dependencies,
		auth,
		profile,
		dashboard,
		seen,
		http: createHttpApplication(application, { publicOrigin: origin })
	};
}

function request(
	path: string,
	method = 'GET',
	headers: Record<string, string> = {},
	body?: unknown
) {
	return new Request(`http://internal-api:3001${path}`, {
		method,
		headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
}

const metadata = { clientAddress: '198.51.100.25' };
const bearer = { Authorization: `Bearer ${token}` };
const cookie = { Cookie: `spellbook_session=${token}` };

function formRequest(
	path: string,
	body: BodyInit = new URLSearchParams(),
	headers: Record<string, string> = {}
) {
	return new Request(`http://internal-api:3001${path}`, {
		method: 'POST',
		headers: { Origin: origin, ...headers },
		body
	});
}

test('explicit auth forms decode original fields and take exactly one attempt before malformed-body validation', async () => {
	const { http, auth, seen } = fixture();
	let response = await http.handle(
		formRequest(
			'/api/web/v1/auth/login',
			new URLSearchParams({ username: 'reader', password: 'password' })
		),
		metadata
	);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { user, token, expiresAt });
	assert.equal(response.headers.getSetCookie().length, 0);
	assert.equal(
		seen.filter((item) => item && typeof item === 'object' && 'address' in item).length,
		1
	);
	const multipart = new FormData();
	multipart.set('username', 'reader');
	multipart.set('password', 'password');
	multipart.set('artworkId', 'grove');
	response = await http.handle(formRequest('/api/web/v1/auth/register', multipart), metadata);
	assert.equal(response.status, 200);
	assert.ok(
		seen.some(
			(item) =>
				item &&
				typeof item === 'object' &&
				'authenticate' in item &&
				JSON.stringify(item.authenticate) ===
					JSON.stringify(['register', 'reader', 'password', { artworkId: 'grove' }])
		)
	);
	auth.authenticate = async () => null;
	response = await http.handle(
		formRequest('/api/web/v1/auth/register', new URLSearchParams({ username: 'draft' })),
		metadata
	);
	assert.deepEqual(await response.json(), {
		message: 'Unable to create an account with those details.',
		username: 'draft',
		artworkId: ''
	});
	response = await http.handle(
		formRequest('/api/web/v1/auth/login', 'bad multipart', {
			'Content-Type': 'multipart/form-data'
		}),
		metadata
	);
	assert.equal(response.status, 400);
	assert.equal((await response.json()).message, 'Invalid form body');
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.equal(
		seen.filter((item) => item && typeof item === 'object' && 'address' in item).length,
		4
	);
	response = await http.handle(
		request('/api/web/v1/auth/login', 'POST', { Origin: origin }, {}),
		metadata
	);
	assert.equal(response.status, 415);
	assert.equal(
		seen.filter((item) => item && typeof item === 'object' && 'address' in item).length,
		5
	);
});

test('password form preserves field DTOs, refuses confirmation mismatch before derivation and excludes Demo attempts', async () => {
	const { http, application, seen, auth } = fixture();
	let response = await http.handle(
		formRequest(
			'/api/web/v1/password',
			new URLSearchParams({
				currentPassword: 'current',
				newPassword: 'valid-new-password',
				confirmPassword: 'mismatch'
			}),
			cookie
		),
		metadata
	);
	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), {
		success: false,
		message: 'Check the password fields and try again.',
		errors: { confirmPassword: 'The new passwords must match.' }
	});
	assert.equal(seen.includes('changePassword'), false);
	assert.equal(
		seen.filter((item) => item && typeof item === 'object' && 'address' in item).length,
		1
	);
	response = await http.handle(
		formRequest(
			'/api/web/v1/password',
			new URLSearchParams({
				currentPassword: 'current',
				newPassword: 'valid-new-password',
				confirmPassword: 'valid-new-password'
			}),
			cookie
		),
		metadata
	);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { success: true, token: replacement, expiresAt });
	assert.match(response.headers.getSetCookie()[0], /^spellbook_session=/);
	auth.changePassword = async () => null;
	response = await http.handle(
		formRequest(
			'/api/web/v1/password',
			new URLSearchParams({
				currentPassword: 'wrong',
				newPassword: 'valid-new-password',
				confirmPassword: 'valid-new-password'
			}),
			bearer
		),
		metadata
	);
	assert.deepEqual(await response.json(), {
		success: false,
		message: 'Your current password could not be verified.',
		errors: { currentPassword: 'Enter your current password and try again.' }
	});
	const demo = createHttpApplication(application, { publicOrigin: origin, demoMode: true });
	const before = seen.length;
	response = await demo.handle(
		formRequest('/api/web/v1/password', 'malformed', {
			...cookie,
			'Content-Type': 'multipart/form-data'
		}),
		metadata
	);
	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), {
		success: false,
		message: 'Password changes are disabled in demo mode.',
		errors: {}
	});
	assert.equal(
		seen.slice(before).filter((item) => item && typeof item === 'object' && 'address' in item)
			.length,
		0
	);
});

test('shared parsers preserve validation and bounded JSON behavior', async () => {
	assert.equal(readString(undefined, 'name', 'default'), 'default');
	assert.equal(readNumber(undefined, 'quantity', 1), 1);
	assert.equal(requireUuid(` ${user.accountId} `), user.accountId);
	assert.equal(readQueryInteger(null, 'limit', 50), 50);
	for (const read of [
		() => readString(null, 'name'),
		() => readNumber(Infinity, 'quantity'),
		() => requireUuid('bad'),
		() => readQueryInteger('1.0', 'limit', 50)
	])
		assert.throws(read, (cause) => cause instanceof HttpError && cause.status === 400);
	for (const [body, contentType, status] of [
		['[]', 'application/json', 400],
		['{"x":', 'application/json', 400],
		['{}', 'text/plain', 415]
	] as const) {
		await assert.rejects(
			readJsonObject(
				new Request(origin, { method: 'POST', headers: { 'Content-Type': contentType }, body })
			),
			(cause) => cause instanceof HttpError && cause.status === status
		);
	}
	await assert.rejects(
		readRequestBytes(new Request(origin, { method: 'POST', body: '12345' }), 4),
		(cause) => cause instanceof HttpError && cause.status === 413
	);
	assert.deepEqual(await readJsonObject(request('/', 'POST', {}, { x: null })), { x: null });
});

test('safe error codec retains text revisions and null quantity without exposing infrastructure details', async () => {
	const latest = { entryId: user.accountId, notes: 'current', notesRevision: '17' };
	let response = errorResponse(new NotesConflictError(latest));
	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {
		kind: 'NotesConflict',
		message: new NotesConflictError(latest).message,
		...latest
	});
	const description = { description: 'saved', descriptionRevision: '18' };
	response = errorResponse(new DescriptionConflictError(description));
	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {
		kind: 'DescriptionConflict',
		message: new DescriptionConflictError(description).message,
		...description
	});
	assert.equal(
		(await errorResponse(new InventoryQuantityChangedError(null)).json()).latestQuantity,
		null
	);
	assert.equal(errorResponse(new RequestConflictError()).status, 409);
	assert.deepEqual(
		await errorResponse(
			Object.assign(new Error('SQL and secret'), { status: 409, kind: 'other' })
		).json(),
		{ message: 'Internal Server Error' }
	);
});

test('registry retains all 16 methods in this slice and public-origin validation is strict', () => {
	const { dependencies, application } = fixture();
	assert.equal(createAuthRoutes(dependencies).length, 9);
	assert.equal(createAccountRoutes(dependencies).length, 6);
	assert.equal(createSavedStateRoutes(dependencies).length, 1);
	for (const publicOrigin of [
		'https://example.com/',
		'https://user:password@example.com',
		'file:///tmp',
		'https://example.com/path'
	])
		assert.throws(() => createHttpApplication(application, { publicOrigin }));
});

test('bearer precedence never falls back to browser cookies, and cookie mutations use the public Origin', async () => {
	const { http, seen } = fixture();
	let response = await http.handle(
		request('/api/account/profile', 'GET', { ...cookie, Authorization: 'malformed' }),
		metadata
	);
	assert.equal(response.status, 401);
	assert.equal((await response.json()).message, 'Invalid bearer token');
	assert.equal(seen.at(-1), undefined);
	response = await http.handle(request('/api/account/profile', 'PATCH', cookie, {}), metadata);
	assert.equal(response.status, 403);
	response = await http.handle(
		request('/api/account/profile', 'PATCH', { ...cookie, Origin: origin }, {}),
		metadata
	);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.deepEqual((await response.json()).user, user);
	response = await http.handle(request('/api/account/profile', 'GET', bearer), metadata);
	assert.equal(response.status, 200);
});

test('auth routes preserve statuses, native form guard, address limiting and session inspection', async () => {
	const { http, seen, auth } = fixture();
	let response = await http.handle(
		request('/api/auth/register', 'POST', {}, { username: 'reader', password: 'test-password' }),
		metadata
	);
	assert.equal(response.status, 201);
	assert.equal(response.headers.get('set-cookie'), null);
	assert.equal((await response.json()).token, token);
	assert.ok(
		seen.some(
			(value) =>
				typeof value === 'object' &&
				value !== null &&
				'address' in value &&
				value.address === metadata.clientAddress
		)
	);
	response = await http.handle(
		request('/api/auth/login', 'POST', { Origin: 'null' }, {}),
		metadata
	);
	assert.equal(response.status, 403);
	auth.authenticate = async () => null;
	response = await http.handle(request('/api/auth/login', 'POST', {}, {}), metadata);
	assert.equal(response.status, 401);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	response = await http.handle(request('/api/auth/session', 'GET', bearer), metadata);
	assert.deepEqual(await response.json(), { user, expiresAt });
	response = await http.handle(request('/api/auth/logout', 'POST', bearer), metadata);
	assert.equal(response.status, 204);
	response = await http.handle(
		request('/api/auth/logout', 'POST', { ...bearer, Origin: 'null' }),
		metadata
	);
	assert.equal(response.status, 403);
});

test('browser QR secrets stay in secure HttpOnly cookies, and redemption preserves separate Set-Cookie headers', async () => {
	const { http, seen } = fixture();
	let response = await http.handle(
		request('/api/auth/qr/requests', 'POST', {}, { kind: 'browser' }),
		metadata
	);
	assert.equal(response.status, 403);
	response = await http.handle(
		request('/api/auth/qr/requests', 'POST', { Origin: origin }, { kind: 'browser' }),
		metadata
	);
	assert.equal(response.status, 201);
	const created = await response.json();
	assert.equal(created.requesterSecret, undefined);
	assert.equal(created.verificationUri, `${origin}/auth/approve?code=${code}`);
	assert.match(
		response.headers.getSetCookie()[0],
		/Path=\/api\/auth\/qr;.*HttpOnly; SameSite=Lax; Secure/
	);
	response = await http.handle(
		request(
			'/api/auth/qr/token',
			'POST',
			{ Origin: origin, Cookie: `spellbook_qr_requester=${code}.${secret}` },
			{ code }
		),
		metadata
	);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { status: 'authenticated', expiresAt });
	assert.equal(response.headers.getSetCookie().length, 2);
	assert.match(response.headers.getSetCookie()[0], /^spellbook_session=/);
	assert.match(response.headers.getSetCookie()[1], /^spellbook_qr_requester=;.*Max-Age=0/);
	assert.ok(
		seen.some(
			(value) =>
				value &&
				typeof value === 'object' &&
				'browserSecret' in value &&
				value.browserSecret === secret
		)
	);
	response = await http.handle(
		request('/api/auth/qr/requests', 'POST', { ...cookie, Origin: origin }, { kind: 'browser' }),
		metadata
	);
	assert.equal(response.status, 409);
	response = await http.handle(
		request('/api/auth/qr/requests', 'POST', {}, { kind: 'device' }),
		metadata
	);
	assert.equal((await response.json()).requesterSecret, secret);
	assert.equal(response.headers.getSetCookie().length, 0);
	response = await http.handle(
		request('/api/auth/qr/token', 'POST', {}, { code, requesterSecret: secret }),
		metadata
	);
	assert.equal((await response.json()).token, replacement);
});

test('account failures remain safe and password replacement cookie follows the chosen credential mode', async () => {
	const { http, profile, dashboard } = fixture();
	let response = await http.handle(
		request(
			'/api/account/password',
			'POST',
			{ ...cookie, Origin: origin },
			{ currentPassword: 'current', newPassword: 'replacement' }
		),
		metadata
	);
	assert.equal(response.status, 200);
	assert.match(response.headers.getSetCookie()[0], new RegExp(`spellbook_session=${replacement}`));
	response = await http.handle(
		request('/api/account/password', 'POST', bearer, {
			currentPassword: 'current',
			newPassword: 'replacement'
		}),
		metadata
	);
	assert.equal(response.headers.getSetCookie().length, 0);
	response = await http.handle(
		request('/api/account/password', 'POST', bearer, {
			currentPassword: 'current',
			newPassword: 'replacement',
			accountId: 'forged'
		}),
		metadata
	);
	assert.equal(response.status, 400);
	profile.patch = async () => {
		throw new ProfileError('Invalid fields', { email: 'Invalid email' });
	};
	response = await http.handle(
		request('/api/account/profile', 'PATCH', bearer, { email: 'bad' }),
		metadata
	);
	assert.deepEqual(await response.json(), {
		kind: 'ValidationFailed',
		message: 'Invalid fields',
		fields: { email: 'Invalid email' }
	});
	dashboard.get = async () => {
		throw new SummaryRangeError();
	};
	response = await http.handle(request('/api/account/dashboard', 'GET', bearer), metadata);
	assert.equal(response.status, 503);
});

test('SavedState authorizes on downstream pull, bounds prefetch and closes cancellation resources', async () => {
	let next = 0,
		delivered = 0,
		closed = 0;
	const subscription: SavedStateSubscription = {
		async next() {
			next++;
			return { event: 'reset', data: {} };
		},
		async deliver(event) {
			delivered++;
			return event;
		},
		close() {
			closed++;
		}
	};
	const cancellation = new AbortController();
	const stream = savedStateBody(subscription, cancellation.signal);
	await delay(5);
	assert.equal(next, 0);
	const reader = stream.body.getReader();
	assert.match(
		new TextDecoder().decode((await reader.read()).value),
		/event: reset\ndata: \{\}\n\n/
	);
	await delay(5);
	assert.equal(next, 1);
	assert.equal(delivered, 1);
	cancellation.abort();
	assert.equal((await reader.read()).done, true);
	assert.equal(closed, 1);
});

test('SavedState rejects foreign origins and query authority, cancels setup and closes attached streams', async () => {
	const { application, http } = fixture();
	let cancelled = false;
	let finish: ((value: SavedStateSubscription) => void) | undefined;
	application.savedState = {
		async subscribe(_user, cancellation) {
			cancellation?.onAbort(() => {
				cancelled = true;
			});
			return new Promise((resolve) => {
				finish = resolve;
			});
		},
		async close() {},
		diagnostics() {
			return { subscribers: 0, ready: false, queuedEvents: 0 };
		}
	};
	let response = await http.handle(
		request('/api/account/events?token=forged', 'GET', bearer),
		metadata
	);
	assert.equal(response.status, 400);
	response = await http.handle(
		request('/api/account/events', 'GET', { ...bearer, Origin: 'null' }),
		metadata
	);
	assert.equal(response.status, 403);
	const pending = http.handle(request('/api/account/events', 'GET', bearer), metadata);
	while (!finish) await delay(1);
	await http.closeStreams();
	assert.equal(cancelled, true);
	let closed = false;
	finish({
		async next() {
			return null;
		},
		async deliver(event) {
			return event;
		},
		close() {
			closed = true;
		}
	});
	response = await pending;
	assert.equal(response.status, 503);
	assert.equal(closed, true);
});

test('Node host ignores spoofed forwarding and honors only an explicitly trusted peer', async (t) => {
	const app: HttpApplication = {
		async handle(_request, metadata) {
			return json(metadata);
		},
		async closeStreams() {}
	};
	const direct = createNodeHttpServer(app, { publicOrigin: origin });
	const trusted = createNodeHttpServer(app, {
		publicOrigin: origin,
		trustedProxyAddresses: ['127.0.0.1', '::1']
	});
	t.after(async () => {
		await direct.close();
		await trusted.close();
	});
	const directAddress = await direct.listen(0);
	const trustedAddress = await trusted.listen(0);
	const headers = {
		'X-Spellbook-Client-Address': '203.0.113.8',
		'X-Forwarded-For': '203.0.113.9',
		Forwarded: 'for=203.0.113.10'
	};
	assert.equal(
		(await (await fetch(`http://127.0.0.1:${directAddress.port}`, { headers })).json())
			.clientAddress,
		'127.0.0.1'
	);
	assert.equal(
		(await (await fetch(`http://127.0.0.1:${trustedAddress.port}`, { headers })).json())
			.clientAddress,
		'203.0.113.8'
	);
	assert.equal(
		(
			await (
				await fetch(`http://127.0.0.1:${trustedAddress.port}`, {
					headers: { ...headers, 'X-Spellbook-Client-Address': '203.0.113.8, 203.0.113.9' }
				})
			).json()
		).clientAddress,
		'127.0.0.1'
	);
	assert.throws(() => parseTrustedProxyAddresses('0.0.0.0/0'));
});

test('actual Node HTTP route resolution prefers literal value reads over dynamic Inventory entries', async (t) => {
	const { dependencies } = fixture();
	const handle = createRouter(
		[
			{
				method: 'POST',
				path: '/api/mobile/v1/mtg/inventory/batch-add',
				async handle() {
					return json({});
				}
			},
			{
				method: 'GET',
				path: '/api/mobile/v1/mtg/inventory/:entryId',
				async handle() {
					error(400, 'entryId must be a UUID');
				}
			},
			...['value', 'value-history'].map((name) => ({
				method: 'GET',
				path: `/api/mobile/v1/mtg/inventory/${name}`,
				async handle(context: Parameters<typeof requireMobileAuth>[0]) {
					await requireMobileAuth(context, dependencies);
					return json({ read: name });
				}
			}))
		],
		dependencies
	);
	const server = createNodeHttpServer(
		{ handle, async closeStreams() {} },
		{ publicOrigin: origin }
	);
	t.after(() => server.close());
	const address = await server.listen(0);
	assert.equal(
		(await fetch(`http://127.0.0.1:${address.port}/api/mobile/v1/mtg/inventory/batch-add`)).status,
		405
	);
	for (const name of ['value', 'value-history']) {
		let response = await fetch(
			`http://127.0.0.1:${address.port}/api/mobile/v1/mtg/inventory/${name}`,
			{ headers: bearer }
		);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { read: name });
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		response = await fetch(`http://127.0.0.1:${address.port}/api/mobile/v1/mtg/inventory/${name}`);
		assert.equal(response.status, 401);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
	}
});

test('paused real TCP readers stop Node response production and disconnect cancels the stream', async (t) => {
	let produced = 0,
		cancelled = false;
	const app: HttpApplication = {
		async handle() {
			return new Response(
				new ReadableStream<Uint8Array>(
					{
						pull(controller) {
							if (produced === 128) {
								controller.close();
								return;
							}
							produced++;
							controller.enqueue(new Uint8Array(256 * 1024));
						},
						cancel() {
							cancelled = true;
						}
					},
					{ highWaterMark: 0 }
				)
			);
		},
		async closeStreams() {}
	};
	const server = createNodeHttpServer(app, { publicOrigin: origin });
	t.after(() => server.close());
	const address = await server.listen(0);
	const client = httpRequest(`http://127.0.0.1:${address.port}`);
	const incoming = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
		client.once('response', resolve);
		client.once('error', reject);
		client.end();
	});
	incoming.pause();
	await delay(80);
	assert.ok(
		produced > 0 && produced < 128,
		`Produced ${produced} chunks while TCP reader was paused`
	);
	incoming.destroy();
	for (let i = 0; !cancelled && i < 100; i++) await delay(5);
	assert.equal(cancelled, true);
});

test('Node host preserves duplicate cookies, returns body-limit errors and aborts disconnected requests', async (t) => {
	let aborted = false;
	const app: HttpApplication = {
		async handle(request) {
			if (new URL(request.url).pathname === '/abort') {
				await new Promise<void>((resolve) =>
					request.signal.addEventListener(
						'abort',
						() => {
							aborted = true;
							resolve();
						},
						{ once: true }
					)
				);
				return json({});
			}
			if (request.method === 'POST') {
				try {
					return json(await readJsonObject(request));
				} catch (cause) {
					return errorResponse(cause);
				}
			}
			const headers = new Headers();
			headers.append('Set-Cookie', 'one=1; HttpOnly');
			headers.append('Set-Cookie', 'two=2; HttpOnly');
			return json({}, { headers });
		},
		async closeStreams() {}
	};
	const server = createNodeHttpServer(app, { publicOrigin: origin, maxBodyBytes: 8 });
	t.after(() => server.close());
	const address = await server.listen(0);
	const base = `http://127.0.0.1:${address.port}`;
	assert.equal((await fetch(base)).headers.getSetCookie().length, 2);
	const response = await fetch(base, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{"long":1234}'
	});
	assert.equal(response.status, 413);
	assert.equal((await response.json()).message, 'Request body exceeds the size limit');
	const cancellation = new AbortController();
	const pending = fetch(`${base}/abort`, { signal: cancellation.signal }).catch(() => {});
	await delay(30);
	cancellation.abort();
	await pending;
	for (let i = 0; !aborted && i < 100; i++) await delay(5);
	assert.equal(aborted, true);
});

test('graceful Node shutdown closes SSE before waiting for live HTTP connections', async (t) => {
	let close: (() => void) | undefined;
	let closed = false;
	const app: HttpApplication = {
		async handle(request) {
			const subscription: SavedStateSubscription = {
				next: () =>
					new Promise((resolve) => {
						close = () => resolve(null);
					}),
				async deliver(event) {
					return event;
				},
				close() {
					closed = true;
					close?.();
				}
			};
			const stream = savedStateBody(subscription, request.signal);
			app.closeStreams = async () => stream.close();
			return new Response(stream.body, { headers: { 'Content-Type': 'text/event-stream' } });
		},
		async closeStreams() {}
	};
	const server = createNodeHttpServer(app, { publicOrigin: origin });
	t.after(() => server.close());
	const address = await server.listen(0);
	const response = await fetch(`http://127.0.0.1:${address.port}`);
	assert.equal(response.headers.get('content-type'), 'text/event-stream');
	await server.close();
	assert.equal(closed, true);
	assert.equal((await response.body!.getReader().read()).done, true);
});
