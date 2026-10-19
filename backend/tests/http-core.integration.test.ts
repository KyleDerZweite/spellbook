import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { createApplication } from '../src/application.ts';
import { createHttpApplication } from '../src/http/application.ts';
import { createNodeHttpServer } from '../src/http/node.ts';
import { hashSessionToken } from '../src/auth/session.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const publicOrigin = 'https://spellbook-core.example';
const password = 'test-password-for-http-core';

test(
	'real PostgreSQL HTTP Auth, Account, QR, session rotation and SavedState lifecycle',
	{
		skip: !databaseUrl,
		timeout: 90_000
	},
	async (t) => {
		assert.equal(
			databaseUrl,
			process.env.DATABASE_URL,
			'Use the same disposable DATABASE_URL and TEST_DATABASE_URL'
		);
		const pool = new pg.Pool({ connectionString: databaseUrl });
		const lifetime = await createApplication({ databaseUrl, valueHistoryEnabled: 'false' });
		const replica = await createApplication({ databaseUrl, valueHistoryEnabled: 'false' });
		const http = createHttpApplication(lifetime.application, { publicOrigin });
		const otherHttp = createHttpApplication(replica.application, { publicOrigin });
		const server = createNodeHttpServer(http, {
			publicOrigin,
			trustedProxyAddresses: ['127.0.0.1']
		});
		const otherServer = createNodeHttpServer(otherHttp, { publicOrigin });
		const accounts: string[] = [];
		const codes: string[] = [];
		t.after(async () => {
			await server.close();
			await otherServer.close();
			await lifetime.close();
			await replica.close();
			await pool.query('DELETE FROM qr_authorizations WHERE code_hash=ANY($1::text[])', [codes]);
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
			await pool.end();
		});
		const address = await server.listen(0);
		const otherAddress = await otherServer.listen(0);
		const base = `http://127.0.0.1:${address.port}`;
		const otherBase = `http://127.0.0.1:${otherAddress.port}`;
		async function call(
			path: string,
			method = 'GET',
			headers: Record<string, string> = {},
			body?: unknown
		) {
			return fetch(`${base}${path}`, {
				method,
				headers: {
					...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
					...headers
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) })
			});
		}
		async function register() {
			const username = `http_${randomUUID().slice(0, 20)}`;
			const response = await call('/api/auth/register', 'POST', {}, { username, password });
			assert.equal(response.status, 201, await response.clone().text());
			assert.equal(response.headers.getSetCookie().length, 0);
			const result = await response.json();
			accounts.push(result.user.accountId);
			return result as {
				user: { accountId: string; username: string };
				token: string;
				expiresAt: string;
			};
		}
		const alice = await register(),
			bob = await register();
		const authorization = { Authorization: `Bearer ${alice.token}` };
		const browser = { Cookie: `spellbook_session=${alice.token}`, Origin: publicOrigin };
		async function createQr(kind: 'browser' | 'device') {
			const response = await call(
				'/api/auth/qr/requests',
				'POST',
				{ Origin: publicOrigin },
				{ kind }
			);
			assert.equal(response.status, 201, await response.clone().text());
			const body = await response.json();
			codes.push(hashSessionToken(body.code));
			return { response, body };
		}
		await t.test(
			'credentials are revalidated into the original private actor binding and Account reads preserve authority',
			async () => {
				const response = await call('/api/account/profile', 'GET', authorization);
				assert.equal(response.status, 200, await response.clone().text());
				assert.equal((await response.json()).user.accountId, alice.user.accountId);
				assert.equal((await call('/api/account/dashboard', 'GET', authorization)).status, 200);
				assert.equal(
					(
						await call('/api/account/profile', 'GET', {
							...browser,
							Authorization: 'Bearer invalid'
						})
					).status,
					401
				);
				assert.equal(
					(await call('/api/account/profile', 'PATCH', browser, { email: 'http-core@example.com' }))
						.status,
					200
				);
				assert.equal(
					(
						await call('/api/account/profile', 'PATCH', authorization, {
							accountId: bob.user.accountId
						})
					).status,
					400
				);
				const inspected = await (await call('/api/auth/session', 'GET', authorization)).json();
				assert.deepEqual(Object.keys(inspected).sort(), ['expiresAt', 'user']);
				const actor = await lifetime.application.auth.validateSession(alice.token);
				assert.ok(actor);
				await assert.rejects(lifetime.application.auth.requireActor({ ...actor }), {
					kind: 'Unauthenticated'
				});
			}
		);
		await t.test(
			'browser QR request, explicit decision, one-use concurrent redemption and HttpOnly credentials',
			async () => {
				const created = await createQr('browser');
				assert.equal(created.body.requesterSecret, undefined);
				assert.equal(
					created.body.verificationUri,
					`${publicOrigin}/auth/approve?code=${created.body.code}`
				);
				const requesterCookie = created.response.headers.getSetCookie()[0].split(';')[0];
				assert.match(created.response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Secure/);
				const path = `/api/auth/qr/requests/${created.body.code}`;
				assert.equal((await call(path, 'GET', authorization)).status, 200);
				assert.equal(
					(await call(`${path}/decision`, 'POST', authorization, { decision: 'approve' })).status,
					200
				);
				assert.equal(
					(
						await call(
							`${path}/decision`,
							'POST',
							{ Authorization: `Bearer ${bob.token}` },
							{ decision: 'approve' }
						)
					).status,
					409
				);
				assert.equal(
					(
						await call(
							'/api/auth/qr/token',
							'POST',
							{ Cookie: requesterCookie },
							{ code: created.body.code }
						)
					).status,
					403
				);
				const responses = await Promise.all(
					[0, 1].map(() =>
						call(
							'/api/auth/qr/token',
							'POST',
							{ Cookie: requesterCookie, Origin: publicOrigin },
							{ code: created.body.code }
						)
					)
				);
				const results = await Promise.all(responses.map((response) => response.json()));
				assert.deepEqual(results.map((result) => result.status).sort(), [
					'authenticated',
					'consumed'
				]);
				const success = responses[results.findIndex((result) => result.status === 'authenticated')];
				assert.equal(success.headers.getSetCookie().length, 2);
				assert.ok(results.every((result) => result.token === undefined));
			}
		);
		await t.test(
			'device secrets stay separate and requester/decision validation preserves protocol failures',
			async () => {
				const created = await createQr('device');
				assert.match(created.body.requesterSecret, /^[A-Za-z0-9_-]{43}$/);
				assert.equal(created.response.headers.getSetCookie().length, 0);
				const path = `/api/auth/qr/requests/${created.body.code}`;
				assert.equal(
					(
						await call(
							'/api/auth/qr/token',
							'POST',
							{},
							{ code: created.body.code, requesterSecret: 'x'.repeat(43) }
						)
					).status,
					401
				);
				assert.equal(
					(
						await call(`${path}/decision`, 'POST', authorization, {
							decision: 'approve',
							accountId: bob.user.accountId
						})
					).status,
					400
				);
				assert.equal(
					(await call(`${path}/decision`, 'POST', authorization, { decision: 'approve' })).status,
					200
				);
				assert.equal(
					(await call(`${path}/decision`, 'POST', authorization, { decision: 'deny' })).status,
					409
				);
				const redeemed = await call(
					'/api/auth/qr/token',
					'POST',
					{},
					{ code: created.body.code, requesterSecret: created.body.requesterSecret }
				);
				const result = await redeemed.json();
				assert.equal(result.status, 'authenticated');
				assert.match(result.token, /^[A-Za-z0-9_-]{43}$/);
				assert.equal(redeemed.headers.getSetCookie().length, 0);
				assert.equal(
					(await call('/api/auth/session', 'GET', { Authorization: `Bearer ${result.token}` }))
						.status,
					200
				);
			}
		);
		await t.test(
			'separate application listeners receive real PostgreSQL invalidation and revoked sessions close their stream',
			async () => {
				const cancellation = new AbortController();
				const response = await fetch(`${otherBase}/api/account/events`, {
					headers: authorization,
					signal: cancellation.signal
				});
				assert.equal(response.status, 200);
				assert.equal(response.headers.get('x-accel-buffering'), 'no');
				const reader = response.body!.getReader();
				const decoder = new TextDecoder();
				assert.match(decoder.decode((await reader.read()).value), /event: reset/);
				assert.equal(
					(
						await call('/api/account/profile', 'PATCH', browser, {
							email: 'changed-http-core@example.com'
						})
					).status,
					200
				);
				let text = '';
				while (!text.includes('event: invalidate'))
					text += decoder.decode((await reader.read()).value);
				assert.match(text, /"profile"/);
				assert.equal((await call('/api/auth/logout', 'POST', authorization)).status, 204);
				text = '';
				while (!text.includes('event: auth-expired')) {
					const chunk = await reader.read();
					assert.equal(chunk.done, false);
					text += decoder.decode(chunk.value);
				}
				assert.equal((await reader.read()).done, true);
				cancellation.abort();
				assert.equal(replica.application.savedState.diagnostics().subscribers, 0);
			}
		);
		await t.test(
			'password rotation revokes old sessions and invalidates existing QR approval',
			async () => {
				const login = await call(
					'/api/auth/login',
					'POST',
					{},
					{ username: alice.user.username, password }
				);
				assert.equal(login.status, 200);
				const active = (await login.json()).token;
				const auth = { Authorization: `Bearer ${active}` };
				const created = await createQr('device');
				assert.equal(
					(
						await call(`/api/auth/qr/requests/${created.body.code}/decision`, 'POST', auth, {
							decision: 'approve'
						})
					).status,
					200
				);
				const response = await call(
					'/api/account/password',
					'POST',
					{ Cookie: `spellbook_session=${active}`, Origin: publicOrigin },
					{ currentPassword: password, newPassword: 'new-password-for-http-core' }
				);
				assert.equal(response.status, 200, await response.clone().text());
				const rotated = await response.json();
				assert.ok(
					response.headers
						.getSetCookie()
						.some((cookie) => cookie.startsWith(`spellbook_session=${rotated.token}`))
				);
				assert.equal((await call('/api/auth/session', 'GET', auth)).status, 401);
				assert.equal(
					(await call('/api/auth/session', 'GET', { Authorization: `Bearer ${rotated.token}` }))
						.status,
					200
				);
				assert.equal(
					(
						await (
							await call(
								'/api/auth/qr/token',
								'POST',
								{},
								{ code: created.body.code, requesterSecret: created.body.requesterSecret }
							)
						).json()
					).status,
					'expired'
				);
				assert.equal(
					(await call('/api/auth/login', 'POST', {}, { username: alice.user.username, password }))
						.status,
					401
				);
			}
		);
		await t.test(
			'per-address rate limiting is API-owned and ignores arbitrary forwarded chains',
			async () => {
				const headers = { 'X-Spellbook-Client-Address': '198.51.100.25' };
				for (let i = 0; i < 20; i++)
					assert.equal(
						(
							await call('/api/auth/login', 'POST', headers, {
								username: 'invalid',
								password: 'short'
							})
						).status,
						401
					);
				assert.equal(
					(
						await call(
							'/api/auth/login',
							'POST',
							{ ...headers, 'X-Forwarded-For': '198.51.100.26' },
							{ username: 'invalid', password: 'short' }
						)
					).status,
					429
				);
			}
		);
	}
);
