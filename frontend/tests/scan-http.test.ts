import { createScanSave } from '../src/lib/scan/save.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm, readdir } from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import pg from 'pg';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';

const url = process.env.DATABASE_URL;
if (
	!url ||
	url !== process.env.TEST_DATABASE_URL ||
	new URL(url).pathname !==
		'/' +
			(process.env.TEST_SCAN_DATABASE_NAME ??
				(process.env.CI ? 'spellbook_test' : 'spellbook_scan_contracts_07_20261007'))
)
	throw new Error('Scan HTTP assigned disposable database guard failed');
const origin = httpTestOrigin();
const pool = new pg.Pool({ connectionString: url });
const api = '/api/mobile/v1/mtg/scan';
const accounts: string[] = [],
	sessions: string[] = [];
let child: ChildProcess | undefined;
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
async function account() {
	const username = `scan_http_${randomUUID().slice(0, 8)}`,
		password = `scan-http-${randomUUID()}`;
	const response = await fixtureAuthRequest(
		origin,
		'/api/auth/register',
		{ username, password },
		{ origin }
	);
	const result = await response.json();
	accounts.push(result.user.accountId);
	assert.equal(response.status, 201);
	return {
		authorization: `Bearer ${result.token}`,
		cookie: `spellbook_session=${result.token}`,
		accountId: result.user.accountId
	};
}
async function request(
	path: string,
	method = 'GET',
	headers: Record<string, string> = {},
	body?: BodyInit | null
) {
	return fetch(origin + path, { method, headers, body, redirect: 'manual' });
}
async function session(authorization: string) {
	const response = await request(`${api}/sessions`, 'POST', { authorization });
	assert.equal(response.status, 200);
	const result = await response.json();
	sessions.push(result.session.id);
	return result.session;
}
function frame(bytes: Uint8Array = png, type = 'image/png') {
	const form = new FormData();
	form.set('file', new File([new Uint8Array(bytes)], 'photo.png', { type }));
	return form;
}
async function jsonPost(path: string, body: unknown, headers: Record<string, string>) {
	return request(
		path,
		'POST',
		{ 'content-type': 'application/json', ...headers },
		JSON.stringify(body)
	);
}
async function lockBarrier(client: pg.PoolClient) {
	const pid = (await client.query('SELECT pg_backend_pid() AS id')).rows[0].id;
	const until = Date.now() + 5000;
	while (Date.now() < until) {
		if (
			(
				await pool.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [
					pid
				])
			).rowCount
		)
			return;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error('Built request never reached PG lock barrier');
}

test('built Scan HTTP with actual Python worker and isolated PostgreSQL', async (t) => {
	try {
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		const worker = new URL(process.env.SCAN_WORKER_URL!);
		assert.equal(worker.hostname, '127.0.0.1');
		assert.ok(
			Number.isInteger(Number(worker.port)) &&
				Number(worker.port) > 0 &&
				Number(worker.port) <= 65535,
			'Explicit SCAN_WORKER_URL must name a loopback port'
		);
		assert.equal((await fetch(new URL('/health', worker))).status, 200);
		const card = await ensureDeckCatalogFixture(pool);
		const a = await account(),
			b = await account();
		await t.test(
			'owned create/upload/no-match/manual commit/image/replay journey is compact and private',
			async () => {
				const s = await session(a.authorization);
				assert.equal(s.status, 'open');
				assert.equal(s.accountId, undefined);
				const uploaded = await request(
					`${api}/sessions/${s.id}/frames`,
					'POST',
					{ authorization: a.authorization },
					frame()
				);
				assert.equal(uploaded.status, 200);
				const photo = await uploaded.json();
				assert.equal(photo.result.status, 'no_match');
				assert.equal(photo.result.normalizedObjectKey, undefined);
				assert.equal(photo.artifact.accountId, undefined);
				const image = await request(`${api}/artifacts/${photo.artifact.id}/image`, 'GET', {
					authorization: a.authorization
				});
				assert.equal(image.status, 200);
				assert.equal(image.headers.get('content-type'), 'image/png');
				assert.equal(image.headers.get('cache-control'), 'no-store');
				assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
				assert.equal(image.headers.get('content-length'), '8');
				assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png);
				assert.equal(
					(
						await request(`${api}/artifacts/${photo.artifact.id}/image`, 'GET', {
							authorization: b.authorization
						})
					).status,
					404
				);
				const intent = {
					requestId: randomUUID(),
					sessionId: s.id,
					items: [
						{
							scanArtifactId: photo.artifact.id,
							catalogCardId: card.catalogCardId,
							quantity: 3,
							finish: 'nonfoil',
							condition: 'NM'
						}
					]
				};
				const saved = await jsonPost(`${api}/review/commit`, intent, {
					authorization: a.authorization
				});
				assert.equal(saved.status, 200);
				const ack = await saved.json();
				assert.equal(ack.kind, 'Committed');
				assert.equal(ack.acknowledgement.changes[0].quantity, 3);
				assert.ok(JSON.stringify(ack).length < 2000);
				assert.equal(ack.cards, undefined);
				assert.deepEqual(
					await (
						await jsonPost(`${api}/review/commit`, intent, { authorization: a.authorization })
					).json(),
					ack
				);
				assert.equal(
					(
						await jsonPost(
							`${api}/review/commit`,
							{ ...intent, items: [{ ...intent.items[0], quantity: 4 }] },
							{ authorization: a.authorization }
						)
					).status,
					409
				);
				const read = await request(`${api}/sessions/${s.id}/result`, 'GET', {
					authorization: a.authorization
				});
				assert.equal(read.headers.get('cache-control'), 'no-store');
				const result = await read.json();
				assert.equal(result.session.status, 'committed');
				assert.equal(result.lastResult.artifactId, photo.artifact.id);
				assert.equal(result.reviewItems[0].canonicalCardId, card.canonicalCardId);
				assert.equal(result.reviewItems[0].name, card.name);
				for (const key of [
					'accountId',
					'originalObjectKey',
					'normalizedObjectKey',
					'candidateJson'
				])
					assert.ok(!JSON.stringify(result).includes(`"${key}"`));
			}
		);
		await t.test(
			'confirmed frontend save survives discarded bounded read and recovers without another mutation',
			async () => {
				const s = await session(a.authorization),
					upload = await request(
						`${api}/sessions/${s.id}/frames`,
						'POST',
						{ authorization: a.authorization },
						frame()
					);
				assert.equal(upload.status, 200);
				const photo = await upload.json();
				const input = {
					requestId: randomUUID(),
					sessionId: s.id,
					items: [
						{
							scanArtifactId: photo.artifact.id,
							catalogCardId: card.catalogCardId,
							quantity: 2,
							finish: 'nonfoil',
							condition: 'LP'
						}
					]
				};
				let mutations = 0,
					reads = 0;
				const saved = createScanSave({
					commit: async (body) => {
						mutations++;
						const response = await request(
							`${api}/review/commit`,
							'POST',
							{ authorization: a.authorization, 'content-type': 'application/json' },
							body
						);
						assert.equal(response.status, 200);
						return response.json();
					},
					read: async (id) => {
						reads++;
						const response = await request(`${api}/sessions/${id}/result`, 'GET', {
							authorization: a.authorization
						});
						assert.equal(response.status, 200);
						if (reads === 1) {
							await response.body?.cancel();
							throw Error('Intentionally discarded physical current-read response');
						}
						return response.json();
					}
				});
				const original = await saved.commit(JSON.stringify(input));
				assert.equal(original.kind, 'Committed');
				await assert.rejects(saved.read(), /discarded/);
				assert.deepEqual(saved.acknowledgement, original);
				assert.deepEqual(
					await saved.commit(JSON.stringify({ ...input, requestId: randomUUID() })),
					original
				);
				const current = await saved.read();
				assert.equal(current.session.status, 'committed');
				assert.equal(current.reviewCount, 1);
				assert.equal(current.reviewItems[0].quantity, 2);
				assert.equal(current.reviewItems[0].condition, 'LP');
				assert.equal(mutations, 1);
				assert.equal(reads, 2);
			}
		);

		await t.test(
			'bodyless session and exact multipart Origin/bearer/cookie matrix retains guard ordering',
			async () => {
				for (const suppliedOrigin of ['https://foreign.test', 'null']) {
					assert.equal(
						(
							await request(`${api}/sessions`, 'POST', {
								authorization: a.authorization,
								origin: suppliedOrigin
							})
						).status,
						403
					);
					const s = await session(a.authorization);
					assert.equal(
						(
							await request(
								`${api}/sessions/${s.id}/frames`,
								'POST',
								{ authorization: a.authorization, origin: suppliedOrigin },
								frame()
							)
						).status,
						403
					);
				}
				for (const bearer of ['malformed', `Bearer ${'a'.repeat(43)}`]) {
					const expected = bearer === 'malformed' ? 403 : 401;
					assert.equal(
						(await request(`${api}/sessions`, 'POST', { authorization: bearer, cookie: a.cookie }))
							.status,
						expected
					);
					const s = await session(a.authorization);
					assert.equal(
						(
							await request(
								`${api}/sessions/${s.id}/frames`,
								'POST',
								{ authorization: bearer, cookie: a.cookie },
								frame()
							)
						).status,
						expected
					);
					assert.equal(
						(
							await request(`${api}/sessions`, 'POST', {
								authorization: bearer,
								cookie: a.cookie,
								origin
							})
						).status,
						401
					);
				}
				assert.equal((await request(`${api}/sessions`, 'POST', { cookie: a.cookie })).status, 403);
				const response = await request(`${api}/sessions`, 'POST', { cookie: a.cookie, origin });
				assert.equal(response.status, 200);
				const s = (await response.json()).session;
				sessions.push(s.id);
				assert.equal(
					(
						await request(
							`${api}/sessions/${s.id}/frames`,
							'POST',
							{ cookie: a.cookie, origin },
							frame()
						)
					).status,
					200
				);
			}
		);
		await t.test(
			'GET reads allow foreign Origin, JSON bearer writes preserve their separate policy',
			async () => {
				const s = await session(a.authorization);
				const photo = await (
					await request(
						`${api}/sessions/${s.id}/frames`,
						'POST',
						{ authorization: a.authorization },
						frame()
					)
				).json();
				for (const suppliedOrigin of [undefined, origin, 'https://foreign.test', 'null']) {
					const headers = {
						authorization: a.authorization,
						...(suppliedOrigin === undefined ? {} : { origin: suppliedOrigin })
					};
					assert.equal(
						(await request(`${api}/sessions/${s.id}/result`, 'GET', headers)).status,
						200
					);
					assert.equal(
						(
							await jsonPost(
								`${api}/sessions/${s.id}/artifacts/${photo.artifact.id}/result`,
								{ status: 'no_match', modelVersion: 'external-v1', candidates: [] },
								headers
							)
						).status,
						200
					);
				}
				assert.equal(
					(
						await jsonPost(
							`${api}/review/commit`,
							{},
							{ authorization: 'malformed', cookie: a.cookie, origin }
						)
					).status,
					401
				);
				assert.equal(
					(
						await jsonPost(
							`${api}/review/commit`,
							{},
							{ cookie: a.cookie, origin: 'https://foreign.test' }
						)
					).status,
					403
				);
			}
		);
		await t.test(
			'pre-body ownership, MIME/signature/size, strict JSON and bounded result failures',
			async () => {
				const s = await session(a.authorization);
				assert.equal(
					(
						await request(
							`${api}/sessions/${s.id}/frames`,
							'POST',
							{ authorization: b.authorization },
							frame()
						)
					).status,
					404
				);
				for (const [bytes, type, expected] of [
					[new Uint8Array(0), 'image/png', 400],
					[png, 'image/jpeg', 415],
					[new Uint8Array(10 * 1024 * 1024 + 1), 'image/png', 413]
				] as const)
					assert.equal(
						(
							await request(
								`${api}/sessions/${s.id}/frames`,
								'POST',
								{ authorization: a.authorization },
								frame(bytes, type)
							)
						).status,
						expected
					);
				assert.equal(
					(
						await request(
							`${api}/sessions/${s.id}/frames`,
							'POST',
							{
								authorization: a.authorization,
								'content-type': 'multipart/form-data; boundary=broken'
							},
							'broken'
						)
					).status,
					400
				);
				assert.equal(
					(
						await request(
							`${api}/sessions/${s.id}/frames`,
							'POST',
							{ authorization: a.authorization, 'content-type': 'application/json' },
							'{}'
						)
					).status,
					415
				);
				const oversized = new ReadableStream({
					start(c) {
						c.enqueue(new Uint8Array(12 * 1024 * 1024 + 1));
						c.close();
					}
				});
				const streamed = await fetch(origin + `${api}/sessions/${s.id}/frames`, {
					method: 'POST',
					headers: {
						authorization: a.authorization,
						'content-type': 'multipart/form-data; boundary=oversized'
					},
					body: oversized,
					duplex: 'half'
				} as RequestInit);
				assert.equal(streamed.status, 413);
				assert.equal(
					(
						await request(`${api}/sessions/${s.id}/result?limit=101`, 'GET', {
							authorization: a.authorization
						})
					).status,
					400
				);
				assert.equal(
					(
						await request(`${api}/sessions/${s.id}/result?limit=1e2`, 'GET', {
							authorization: a.authorization
						})
					).status,
					400
				);
				assert.equal(
					(
						await request(`${api}/sessions/${s.id}/result?artifactCursor=invalid`, 'GET', {
							authorization: a.authorization
						})
					).status,
					400
				);
				assert.equal(
					(
						await request(
							`${api}/review/commit`,
							'POST',
							{ authorization: a.authorization, origin, 'content-type': 'text/plain' },
							'{}'
						)
					).status,
					415
				);
				assert.equal(
					(
						await request(
							`${api}/review/commit`,
							'POST',
							{ authorization: a.authorization, 'content-type': 'application/json' },
							'[]'
						)
					).status,
					400
				);
			}
		);
		await t.test(
			'real response-side abort before attachment leaves no artifact or new object',
			async () => {
				const s = await session(a.authorization),
					client = await pool.connect(),
					controller = new AbortController();
				await client.query('BEGIN');
				await client.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
					a.accountId
				]);
				const aborting = fetch(origin + `${api}/sessions/${s.id}/frames`, {
					method: 'POST',
					headers: { authorization: a.authorization },
					body: frame(),
					signal: controller.signal
				}).catch(() => null);
				try {
					await lockBarrier(client);
					controller.abort();
					await aborting;
					await new Promise((r) => setTimeout(r, 30));
					await client.query('ROLLBACK');
					const until = Date.now() + 4000;
					let files: string[] = [];
					do {
						files = await readdir(
							`${process.env.SCAN_LOCAL_STORAGE_DIR}/scan-sessions/${s.id}`
						).catch(() => []);
						if (!files.length) break;
						await new Promise((r) => setTimeout(r, 10));
					} while (Date.now() < until);
					assert.deepEqual(files, []);
					const result = await (
						await request(`${api}/sessions/${s.id}/result`, 'GET', {
							authorization: a.authorization
						})
					).json();
					assert.equal(result.artifactCount, 0);
				} finally {
					await client.query('ROLLBACK');
					client.release();
					await aborting;
				}
			}
		);
		await t.test(
			'operator revocation after real worker I/O prevents protected attachment',
			async () => {
				const c = await account(),
					s = await session(c.authorization),
					client = await pool.connect();
				await client.query('BEGIN');
				await client.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
					c.accountId
				]);
				const pending = request(
					`${api}/sessions/${s.id}/frames`,
					'POST',
					{ authorization: c.authorization },
					frame()
				);
				try {
					await lockBarrier(client);
					await pool.query('DELETE FROM auth_sessions WHERE account_id=$1', [c.accountId]);
					await client.query('ROLLBACK');
					const response = await pending;
					assert.equal(response.status, 401);
					assert.equal(
						(await pool.query('SELECT id FROM scan_artifacts WHERE session_id=$1', [s.id]))
							.rowCount,
						0
					);
					assert.deepEqual(
						await readdir(`${process.env.SCAN_LOCAL_STORAGE_DIR}/scan-sessions/${s.id}`),
						[]
					);
				} finally {
					await client.query('ROLLBACK');
					client.release();
					await pending.catch(() => {});
				}
			}
		);
	} finally {
		if (child) await stopHttpApplication(child);
		await pool.query('DELETE FROM inventory_mutation_requests WHERE account_id=ANY($1::text[])', [
			accounts
		]);
		await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		for (const id of sessions)
			await rm(`${process.env.SCAN_LOCAL_STORAGE_DIR}/scan-sessions/${id}`, {
				recursive: true,
				force: true
			});
		await pool.end();
	}
});
