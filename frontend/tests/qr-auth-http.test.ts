import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashSessionToken, SESSION_COOKIE } from './fixtures/session.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const requesterCookie = 'spellbook_qr_requester';

test('built HTTP QR sign-in', { skip: !databaseUrl, timeout: 60_000 }, async (t) => {
	assert.equal(
		process.env.DATABASE_URL,
		databaseUrl,
		'Use the same disposable database for app and tests'
	);
	const origin = httpTestOrigin();
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const accounts: string[] = [];
	const codes: string[] = [];
	let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
		const response = await fetch(`${origin}${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: {
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...headers
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			redirect: 'manual'
		});
		assert.equal(response.headers.get('cache-control'), 'no-store');
		return response;
	}
	function cookie(response: Response, name: string) {
		const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
		assert.ok(header, `Expected ${name} cookie`);
		return { header, value: header.split(';')[0] };
	}
	function reviewMarker(html: string) {
		const marker = html.match(/name="review" value="([A-Za-z0-9_-]{43})"/)?.[1];
		assert.ok(marker, 'Approval page supplies a session-bound review marker');
		return marker;
	}
	async function create(kind: 'browser' | 'device') {
		const response = await request(
			'/api/v1/auth/qr/requests',
			{ kind },
			kind === 'browser' ? { origin } : {}
		);
		assert.equal(response.status, 201);
		const result = await response.json();
		codes.push(hashSessionToken(result.code));
		assert.equal(result.kind, kind);
		assert.equal(result.interval, 3);
		assert.equal(result.verificationUri, `${origin}/auth/approve?code=${result.code}`);
		assert.ok(Date.parse(result.expiresAt) > Date.now());
		return { response, result };
	}
	async function actor() {
		const response = await fixtureAuthRequest(
			origin,
			'/api/v1/auth/register',
			{
				username: `qr_http_${randomUUID().slice(0, 8)}`,
				password: 'qr-http-original-password'
			},
			{}
		);
		assert.equal(response.status, 201);
		const result = await response.json();
		accounts.push(result.user.accountId);
		return result;
	}
	try {
		child = await startHttpApplication(origin, new URL('..', import.meta.url));
		const approver = await actor();
		const other = await actor();
		const authorization = `Bearer ${approver.token}`;
		await t.test(
			'approval page requires sign-in and an explicit same-origin decision',
			async () => {
				const { response, result } = await create('browser');
				const path = `/auth/approve?code=${result.code}`;
				const anonymous = await request(path);
				assert.equal(anonymous.status, 303);
				assert.equal(
					new URL(anonymous.headers.get('location')!, origin).searchParams.get('returnTo'),
					path
				);
				const headers = { cookie: `${SESSION_COOKIE}=${approver.token}` };
				const page = await request(path, undefined, headers);
				assert.equal(page.status, 200);
				assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
				const html = await page.text();
				assert.match(html, /Approve sign-in/);
				assert.match(html, /Only approve a code you just scanned/);
				assert.match(html, new RegExp(approver.user.username));
				const visible = (html: string) => html.replace(/<!--.*?-->/gs, '').replace(/\s+/g, ' ');
				assert.ok(
					visible(html).includes(`Sign in to another browser as ${approver.user.username}?`)
				);
				const german = await request(path, undefined, {
					cookie: `${headers.cookie}; website-language=de`
				});
				assert.equal(german.status, 200);
				assert.ok(
					visible(await german.text()).includes(
						`Einen anderen Browser als ${approver.user.username} anmelden?`
					)
				);
				const review = reviewMarker(html);
				assert.equal(
					(
						await (
							await request(`/api/v1/auth/qr/requests/${result.code}`, undefined, { authorization })
						).json()
					).status,
					'pending'
				);
				async function decide(decision: string, suppliedOrigin?: string, token = approver.token) {
					return fetch(origin + path, {
						method: 'POST',
						redirect: 'manual',
						headers: {
							accept: 'text/html',
							cookie: `${SESSION_COOKIE}=${token}`,
							'content-type': 'application/x-www-form-urlencoded',
							...(suppliedOrigin ? { origin: suppliedOrigin } : {})
						},
						body: new URLSearchParams({ decision, review })
					});
				}
				assert.equal((await decide('approve')).status, 403);
				assert.equal((await decide('invalid', origin)).status, 400);
				const switched = await decide('approve', origin, other.token);
				assert.equal(switched.status, 409);
				assert.match(await switched.text(), /Your sign-in session changed/);
				const freshLogin = await fixtureAuthRequest(
					origin,
					'/api/v1/auth/login',
					{ username: approver.user.username, password: 'qr-http-original-password' },
					{}
				);
				assert.equal(freshLogin.status, 200);
				assert.equal(
					(await decide('approve', origin, (await freshLogin.json()).token)).status,
					409
				);
				assert.equal(
					(
						await (
							await request(`/api/v1/auth/qr/requests/${result.code}`, undefined, { authorization })
						).json()
					).status,
					'pending'
				);
				const approved = await decide('approve', origin);
				assert.equal(approved.status, 200);
				assert.match(await approved.text(), /Sign-in approved/);
				const signedIn = await request(
					'/api/v1/auth/qr/token',
					{ code: result.code },
					{ origin, cookie: cookie(response, requesterCookie).value }
				);
				assert.equal((await signedIn.json()).status, 'authenticated');
				const repeated = await decide('approve', origin);
				assert.equal(repeated.status, 200);
				assert.match(await repeated.text(), /already been used/);
				const denied = (await create('device')).result;
				const denialHtml = await (
					await request(`/auth/approve?code=${denied.code}`, undefined, headers)
				).text();
				const denialReview = reviewMarker(denialHtml);
				const deniedPage = await fetch(`${origin}/auth/approve?code=${denied.code}`, {
					method: 'POST',
					headers: {
						...headers,
						accept: 'text/html',
						origin,
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ decision: 'deny', review: denialReview })
				});
				assert.equal(deniedPage.status, 200);
				assert.match(await deniedPage.text(), /Sign-in denied/);
				assert.equal((await request('/auth/approve?code=invalid', undefined, headers)).status, 400);
				assert.equal(
					(await request(`${path}&code=${result.code}`, undefined, headers)).status,
					400
				);
			}
		);
		await t.test(
			'browser private cookie, explicit approval, cookie session delivery and one-time redemption',
			async () => {
				const { response, result } = await create('browser');
				assert.equal(Object.hasOwn(result, 'requesterSecret'), false);
				const privateCookie = cookie(response, requesterCookie);
				assert.match(privateCookie.header, /HttpOnly/i);
				assert.match(privateCookie.header, /SameSite=Lax/i);
				assert.match(privateCookie.header, /Max-Age=300/i);
				assert.match(privateCookie.header, /Path=\/api\/v1\/auth\/qr/i);
				const publicPath = `/api/v1/auth/qr/requests/${result.code}`;
				assert.equal((await request(publicPath)).status, 401);
				const inspected = await request(publicPath, undefined, { authorization });
				const inspectedBody = await inspected.json();
				assert.ok(Date.parse(inspectedBody.createdAt) < Date.parse(result.expiresAt));
				assert.deepEqual(inspectedBody, {
					code: result.code,
					kind: 'browser',
					status: 'pending',
					createdAt: inspectedBody.createdAt,
					expiresAt: result.expiresAt
				});
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code: result.code }, { origin })).status,
					401
				);
				const polling = { origin, cookie: privateCookie.value };
				assert.deepEqual(
					await (await request('/api/v1/auth/qr/token', { code: result.code }, polling)).json(),
					{ status: 'pending' }
				);
				assert.equal(
					(
						await request(
							`${publicPath}/decision`,
							{ decision: 'approve', confirmed: true },
							{ authorization }
						)
					).status,
					200
				);
				const authenticated = await request(
					'/api/v1/auth/qr/token',
					{ code: result.code },
					polling
				);
				assert.equal(authenticated.status, 200);
				const body = await authenticated.json();
				assert.deepEqual(Object.keys(body).sort(), ['expiresAt', 'status']);
				assert.equal(body.status, 'authenticated');
				const sessionCookie = cookie(authenticated, SESSION_COOKIE);
				assert.match(sessionCookie.header, /HttpOnly/i);
				const session = await request('/api/v1/auth/session', undefined, {
					cookie: sessionCookie.value
				});
				assert.equal((await session.json()).user.accountId, approver.user.accountId);
				assert.deepEqual(
					await (await request('/api/v1/auth/qr/token', { code: result.code }, polling)).json(),
					{ status: 'consumed' }
				);
				assert.equal(
					(
						await request(
							'/api/v1/auth/qr/requests',
							{ kind: 'browser' },
							{ origin, cookie: sessionCookie.value }
						)
					).status,
					409
				);
			}
		);
		await t.test(
			'stored device kind returns a bearer only with its private secret, even with browser cookies',
			async () => {
				const { result } = await create('device');
				assert.match(result.requesterSecret, /^[A-Za-z0-9_-]{43}$/);
				assert.equal((await request('/api/v1/auth/qr/token', { code: result.code })).status, 401);
				assert.equal(
					(
						await request('/api/v1/auth/qr/token', {
							code: result.code,
							requesterSecret: 'x'.repeat(43)
						})
					).status,
					401
				);
				await request(
					`/api/v1/auth/qr/requests/${result.code}/decision`,
					{ decision: 'approve', confirmed: true },
					{ authorization }
				);
				const redemption = await request(
					'/api/v1/auth/qr/token',
					{ code: result.code, requesterSecret: result.requesterSecret },
					{ cookie: `${SESSION_COOKIE}=${other.token}` }
				);
				assert.equal(redemption.status, 200);
				assert.equal(
					redemption.headers.getSetCookie().some((value) => value.startsWith(`${SESSION_COOKIE}=`)),
					false
				);
				const body = await redemption.json();
				assert.equal(body.status, 'authenticated');
				assert.match(body.token, /^[A-Za-z0-9_-]{43}$/);
				assert.equal(
					(
						await (
							await request('/api/v1/auth/session', undefined, {
								authorization: `Bearer ${body.token}`
							})
						).json()
					).user.accountId,
					approver.user.accountId
				);
			}
		);
		await t.test(
			'rejects foreign/null/empty supplied Origins, requires same-origin browser cookie mutations',
			async () => {
				const { response, result } = await create('browser');
				const privateCookie = cookie(response, requesterCookie).value;
				const path = `/api/v1/auth/qr/requests/${result.code}`;
				for (const supplied of ['https://foreign.example', 'null', '']) {
					assert.equal(
						(await request('/api/v1/auth/qr/requests', { kind: 'device' }, { origin: supplied }))
							.status,
						403
					);
					assert.equal(
						(await request(path, undefined, { origin: supplied, authorization })).status,
						403
					);
					assert.equal(
						(
							await request(
								`${path}/decision`,
								{ decision: 'approve', confirmed: true },
								{ origin: supplied, authorization }
							)
						).status,
						403
					);
					assert.equal(
						(
							await request(
								'/api/v1/auth/qr/token',
								{ code: result.code },
								{ origin: supplied, cookie: privateCookie }
							)
						).status,
						403
					);
				}
				assert.equal((await request('/api/v1/auth/qr/requests', { kind: 'browser' })).status, 403);
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code: result.code }, { cookie: privateCookie }))
						.status,
					403
				);
				assert.equal(
					(
						await request(
							`${path}/decision`,
							{ decision: 'approve', confirmed: true },
							{ cookie: `${SESSION_COOKIE}=${approver.token}` }
						)
					).status,
					403
				);
			}
		);
		await t.test(
			'Authorization takes precedence and first decision binds the selected session',
			async () => {
				const { result } = await create('device');
				const path = `/api/v1/auth/qr/requests/${result.code}`;
				const browser = { cookie: `${SESSION_COOKIE}=${other.token}`, origin };
				for (const bad of ['Bearer invalid', 'Basic abc', '']) {
					assert.equal(
						(await request(path, undefined, { ...browser, authorization: bad })).status,
						401
					);
					assert.equal(
						(
							await request(
								`${path}/decision`,
								{ decision: 'approve', confirmed: true },
								{ ...browser, authorization: bad }
							)
						).status,
						401
					);
				}
				assert.equal(
					(
						await request(
							`${path}/decision`,
							{ decision: 'approve', confirmed: true },
							{ ...browser, authorization }
						)
					).status,
					200
				);
				assert.equal(
					(
						await request(
							`${path}/decision`,
							{ decision: 'approve', confirmed: true },
							{ authorization }
						)
					).status,
					200
				);
				assert.equal(
					(await request(`${path}/decision`, { decision: 'deny' }, { authorization })).status,
					409
				);
				assert.equal(
					(
						await request(
							`${path}/decision`,
							{ decision: 'approve', confirmed: true },
							{ authorization: `Bearer ${other.token}` }
						)
					).status,
					409
				);
				const body = await (
					await request('/api/v1/auth/qr/token', {
						code: result.code,
						requesterSecret: result.requesterSecret
					})
				).json();
				assert.equal(
					(
						await (
							await request('/api/v1/auth/session', undefined, {
								authorization: `Bearer ${body.token}`
							})
						).json()
					).user.accountId,
					approver.user.accountId
				);
			}
		);
		await t.test(
			'browser body secrets and cookies for another code never redeem; authenticated target rejects switching',
			async () => {
				const first = await create('browser');
				const second = await create('browser');
				const privateCookie = cookie(first.response, requesterCookie).value;
				const secret = decodeURIComponent(privateCookie.split('=')[1]).split('.')[1];
				const code = first.result.code;
				await request(
					`/api/v1/auth/qr/requests/${code}/decision`,
					{ decision: 'approve', confirmed: true },
					{ authorization }
				);
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code, requesterSecret: secret }, { origin }))
						.status,
					400
				);
				assert.equal(
					(
						await request(
							'/api/v1/auth/qr/token',
							{ code },
							{ origin, cookie: cookie(second.response, requesterCookie).value }
						)
					).status,
					401
				);
				assert.equal(
					(
						await request(
							'/api/v1/auth/qr/token',
							{ code },
							{
								origin,
								cookie: `${privateCookie}; ${SESSION_COOKIE}=${other.token}`,
								authorization: 'Bearer invalid'
							}
						)
					).status,
					409
				);
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code }, { origin, cookie: privateCookie }))
						.status,
					200
				);
			}
		);
		await t.test(
			'denied/expired requests remain terminal and JSON fields, size and types are bounded',
			async () => {
				const { result } = await create('device');
				const path = `/api/v1/auth/qr/requests/${result.code}`;
				await request(`${path}/decision`, { decision: 'deny' }, { authorization });
				assert.deepEqual(
					await (
						await request('/api/v1/auth/qr/token', {
							code: result.code,
							requesterSecret: result.requesterSecret
						})
					).json(),
					{ status: 'denied' }
				);
				const expired = (await create('device')).result;
				await pool.query(
					"UPDATE qr_authorizations SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
					[hashSessionToken(expired.code)]
				);
				assert.deepEqual(
					await (
						await request('/api/v1/auth/qr/token', {
							code: expired.code,
							requesterSecret: expired.requesterSecret
						})
					).json(),
					{ status: 'expired' }
				);
				for (const input of [
					{ kind: 'other' },
					{ kind: null },
					{ kind: 'device', accountId: approver.user.accountId },
					[]
				])
					assert.equal((await request('/api/v1/auth/qr/requests', input)).status, 400);
				assert.equal(
					(await request('/api/v1/auth/qr/requests', { kind: 'x'.repeat(1100) })).status,
					413
				);
				assert.equal(
					(
						await request(
							`${path}/decision`,
							{ decision: 'approve', accountId: other.user.accountId },
							{ authorization }
						)
					).status,
					400
				);
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code: result.code, requesterSecret: null }))
						.status,
					400
				);
				assert.equal(
					(await request('/api/v1/auth/qr/token', { code: result.code, kind: 'device' })).status,
					400
				);
			}
		);
		await t.test(
			'device approval shows self-reported metadata, requires confirmation and links a device',
			async () => {
				assert.equal(
					(
						await request(
							'/api/v1/auth/qr/requests',
							{ kind: 'browser', deviceName: 'Browser' },
							{ origin }
						)
					).status,
					400
				);
				assert.equal(
					(await request('/api/v1/auth/qr/requests', { kind: 'device', deviceName: 'a\nb' }))
						.status,
					400
				);
				const created = await request('/api/v1/auth/qr/requests', {
					kind: 'device',
					deviceName: ' HTTP Station ',
					deviceType: 'cardstation'
				});
				assert.equal(created.status, 201);
				const result = await created.json();
				codes.push(hashSessionToken(result.code));
				const path = `/auth/approve?code=${result.code}`;
				const headers = { cookie: `${SESSION_COOKIE}=${approver.token}` };
				const html = await (await request(path, undefined, headers)).text();
				assert.match(html, /HTTP Station/);
				assert.match(html, /Device name \(reported by the device\)/);
				assert.match(html, /Cardstation/);
				assert.ok(html.includes(`${result.code.slice(0, 4)}-${result.code.slice(4, 8)}`));
				assert.match(
					html,
					/Only approve if this device is in front of you and shows the same code\./
				);
				assert.match(html, /name="confirmed"/);
				const review = reviewMarker(html);
				const decide = (fields: Record<string, string>) =>
					fetch(origin + path, {
						method: 'POST',
						redirect: 'manual',
						headers: {
							accept: 'text/html',
							cookie: headers.cookie,
							origin,
							'content-type': 'application/x-www-form-urlencoded'
						},
						body: new URLSearchParams({ decision: 'approve', review, ...fields })
					});
				const apiUnconfirmed = await request(
					`/api/v1/auth/qr/requests/${result.code}/decision`,
					{ decision: 'approve' },
					{ authorization }
				);
				assert.equal(apiUnconfirmed.status, 400);
				assert.equal((await apiUnconfirmed.json()).kind, 'ConfirmationRequired');
				const inspected = await (
					await request(`/api/v1/auth/qr/requests/${result.code}`, undefined, { authorization })
				).json();
				assert.equal(inspected.status, 'pending');
				assert.ok(Date.parse(inspected.createdAt) < Date.parse(inspected.expiresAt));
				const unconfirmed = await decide({});
				assert.equal(unconfirmed.status, 400);
				assert.match(await unconfirmed.text(), /Confirm that the device is in front of you/);
				assert.equal((await decide({ confirmed: 'yes' })).status, 200);
				const redeemed = await (
					await request('/api/v1/auth/qr/token', {
						code: result.code,
						requesterSecret: result.requesterSecret
					})
				).json();
				assert.equal(redeemed.status, 'authenticated');
				const device = { authorization: `Bearer ${redeemed.token}` };
				const session = await (await request('/api/v1/auth/session', undefined, device)).json();
				assert.equal(session.device.name, 'HTTP Station');
				assert.equal(session.device.type, 'cardstation');
				const owner = await (
					await request('/api/v1/auth/session', undefined, { authorization })
				).json();
				assert.equal(owner.device, null);
				const forbidden = await request('/api/v1/account/devices', undefined, device);
				assert.equal(forbidden.status, 403);
				assert.equal((await forbidden.json()).kind, 'DeviceSessionForbidden');
				const listed = await (
					await request('/api/v1/account/devices', undefined, { authorization })
				).json();
				// Earlier device approvals by this account are listed too; the newest comes first.
				assert.equal(listed.devices[0].id, session.device.id);
				assert.equal(listed.devices[0].name, 'HTTP Station');
				assert.equal(
					(
						await request('/api/v1/account/devices', undefined, {
							authorization: `Bearer ${other.token}`
						}).then((r) => r.json())
					).devices.length,
					0
				);
				const target = `${origin}/api/v1/account/devices/${session.device.id}`;
				const foreign = await fetch(target, {
					method: 'DELETE',
					headers: { authorization: `Bearer ${other.token}` }
				});
				assert.equal(foreign.status, 404);
				const renamed = await fetch(target, {
					method: 'PATCH',
					headers: { authorization, 'content-type': 'application/json' },
					body: JSON.stringify({ name: 'Sorter' })
				});
				assert.equal((await renamed.json()).name, 'Sorter');
				const revoked = await fetch(target, { method: 'DELETE', headers: { authorization } });
				assert.equal(revoked.status, 204);
				assert.equal((await request('/api/v1/auth/session', undefined, device)).status, 401);
			}
		);
	} finally {
		if (child) await stopHttpApplication(child);
		await pool.query('DELETE FROM qr_authorizations WHERE code_hash=ANY($1::text[])', [codes]);
		await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		await pool.end();
	}
});
