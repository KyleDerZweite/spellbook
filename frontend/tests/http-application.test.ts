import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
import { seedWideSummary } from './fixtures/wide-summary.ts';
import { seedAccountScaleInventory } from './fixtures/account-scale.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type { InventoryPage } from '@spellbook/contracts/inventory.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL) {
	throw new Error(
		'HTTP tests require DATABASE_URL and TEST_DATABASE_URL to reference the same disposable database.'
	);
}
const origin = httpTestOrigin();
const username = `http_${randomUUID().slice(0, 8)}`;
const password = 'real-http-test-password';
const pool = new pg.Pool({ connectionString: databaseUrl });
const generation = randomUUID();
const accounts: string[] = [];
let child: ChildProcess | undefined;
let previous: { active_generation: string | null; previous_generation: string | null } | undefined;
let fixtureStarted = false;

async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
	return fetch(`${origin}${path}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: 'manual'
	});
}

async function catalogFixture() {
	const cards: CardDocument[] = JSON.parse(
		await readFile(new URL('../scripts/demo/cards.json', import.meta.url), 'utf8')
	);
	const d = cards.find((card) => card.name === 'Sol Ring');
	assert.ok(d);
	previous = (
		await pool.query('SELECT active_generation, previous_generation FROM catalog_state WHERE id=1')
	).rows[0];
	await pool.query(
		"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at) VALUES($1,'http-test',now(),1,now())",
		[generation]
	);
	await pool.query(
		'INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
		[
			generation,
			d.id,
			d.oracle_id,
			d.name,
			d.name.toLowerCase(),
			'',
			d.lang,
			d.set_code,
			d.collector_number,
			d.rarity,
			d.cmc,
			d.colors,
			d.card_types,
			JSON.stringify(d.legalities),
			d.name.toLowerCase(),
			d.name + ' ' + d.oracle_text,
			JSON.stringify({ ...d, privateFixtureField: 'must-not-escape' })
		]
	);
	await pool.query(
		'INSERT INTO catalog_state(id,active_generation) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET active_generation=excluded.active_generation',
		[generation]
	);
	return d;
}

test('built HTTP application preserves public Catalog and local account journeys', async (t) => {
	try {
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		fixtureStarted = true;
		const card = await catalogFixture();
		await t.test('public Search and bounded printing reads use safe DTOs', async () => {
			const response = await request('/api/catalog/search', {
				query: 'Sol Ring',
				limit: 20,
				facets: true
			});
			assert.equal(response.status, 200);
			const search = await response.json();
			assert.equal(search.hits[0].name, 'Sol Ring');
			assert.equal(search.generationId, generation);
			assert.equal(search.hits[0].privateFixtureField, undefined);
			const printings = await (
				await request(`/api/catalog/cards/${card.oracle_id}/printings?limit=1`)
			).json();
			assert.equal(printings.hits[0].id, card.id);
			const page = await request('/mtg/search?q=Sol%20Ring');
			assert.equal(page.status, 200);
			assert.match(await page.text(), /Search/);
			assert.equal(
				(await request('/api/catalog/search', { query: 'Sol Ring', limit: 101 })).status,
				400
			);
		});
		await t.test(
			'API registration, bearer validation, wrong credentials and revocation',
			async () => {
				const registration = await request('/api/auth/register', { username, password });
				assert.equal(registration.status, 201);
				const registered = await registration.json();
				accounts.push(registered.user.accountId);
				assert.equal(registered.user.username, username);
				assert.equal(registered.user.passwordHash, undefined);
				assert.equal(typeof registered.expiresAt, 'string');
				assert.equal(new Date(registered.expiresAt).toISOString(), registered.expiresAt);
				assert.equal(
					(await request('/api/auth/login', { username, password: 'wrong-password' })).status,
					401
				);
				assert.equal((await request('/api/auth/register', { username, password })).status, 400);
				assert.equal(
					(
						await request(
							'/api/auth/login',
							{ username, password },
							{ origin: 'https://foreign.test' }
						)
					).status,
					403
				);
				const login = await request('/api/auth/login', {
					username: username.toUpperCase(),
					password
				});
				assert.equal(login.status, 200);
				const authenticated = await login.json();
				const authorization = `Bearer ${authenticated.token}`;
				assert.equal(
					(await request('/api/mobile/v1/mtg/search?q=Sol%20Ring', undefined, { authorization }))
						.status,
					200
				);
				assert.equal((await request('/api/auth/logout', {}, { authorization })).status, 204);
				assert.equal(
					(await request('/api/mobile/v1/mtg/search?q=Sol%20Ring', undefined, { authorization }))
						.status,
					401
				);
			}
		);
		await t.test(
			'Inventory windows stay bounded and coherent under concurrent writes',
			async () => {
				const login = await (await request('/api/auth/login', { username, password })).json();
				const headers = { authorization: `Bearer ${login.token}` };
				const path = '/api/mobile/v1/mtg/inventory';
				const operations = Array.from({ length: 120 }, (_, i) => ({
					op: 'add',
					card: {
						catalogCardId: randomUUID(),
						canonicalCardId: card.oracle_id,
						name: `Window ${String(i).padStart(3, '0')}`,
						setCode: card.set_code,
						imageUri: card.image_uri
					},
					finish: 'nonfoil',
					condition: 'NM',
					quantity: 2,
					notes: i === 7 ? 'Literal %_ Notes' : ''
				}));
				const id = randomUUID();
				const responses = await Promise.all([
					request(path + '/bulk', { requestId: id, operations }, headers),
					request(path + '/bulk', { requestId: id, operations }, headers)
				]);
				assert.deepEqual(
					responses.map((r) => r.status),
					[200, 200]
				);
				const first: InventoryPage = await (await request(path, undefined, headers)).json();
				assert.equal(first.entries.length, 50);
				assert.equal(first.totals.entryCount, 120);
				assert.equal(first.totals.copyCount, 240);
				const next: InventoryPage = await (
					await request(path + `?page=2&revision=${first.revision}`, undefined, headers)
				).json();
				assert.equal(next.entries.length, 50);
				assert.equal(new Set([...first.entries, ...next.entries].map((e) => e.id)).size, 100);
				const literal = await (await request(path + '?q=%25_', undefined, headers)).json();
				assert.equal(literal.entries.length, 1);
				assert.equal(literal.entries[0].notes, 'Literal %_ Notes');
				const target = first.entries[0];
				const location = await (
					await request(
						path + `/${target.id}/location?revision=${first.revision}`,
						undefined,
						headers
					)
				).json();
				assert.equal(location.index, 0);
				const detail = await (await request(path + `/${target.id}`, undefined, headers)).json();
				assert.equal(detail.entry.id, target.id);
				assert.equal(typeof detail.entry.notesRevision, 'string');
				const write = {
					requestId: randomUUID(),
					operations: [{ op: 'set', target: { entryId: target.id }, quantity: 3, notes: 'changed' }]
				};
				assert.equal((await request(path + '/bulk', write, headers)).status, 200);
				assert.equal(
					(await request(path + `?page=2&revision=${first.revision}`, undefined, headers)).status,
					409
				);
				assert.equal(
					(
						await request(
							path + `/${target.id}/location?revision=${first.revision}`,
							undefined,
							headers
						)
					).status,
					409
				);
				assert.equal((await request(path + '?limit=101', undefined, headers)).status, 400);
				const other = await (
					await request('/api/auth/register', {
						username: `other_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(other.user.accountId);
				assert.equal(
					(
						await request(path + `/${target.id}`, undefined, {
							authorization: `Bearer ${other.token}`
						})
					).status,
					404
				);
				const own = await (await request(path, undefined, headers)).json();
				assert.equal(own.totals.copyCount, 241);
				const native = await request(
					'/mtg/inventory?q=Window&page=2&sort=name&dir=desc',
					undefined,
					{ cookie: `spellbook_session=${login.token}` }
				);
				assert.equal(native.status, 200);
				const html = await native.text();
				assert.match(html, /page=1/);
				assert.match(html, /name="sort"/);
				assert.equal((html.match(/data-inventory-row/g) || []).length, 50);
			}
		);

		await t.test(
			'native web forms set cookies, preserve destinations and enforce protected pages',
			async () => {
				const url = `${origin}/auth/login?returnTo=%2Fmtg%2Finventory`;
				const response = await fetch(url, {
					method: 'POST',
					headers: {
						origin,
						accept: 'text/html',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ username, password }),
					redirect: 'manual'
				});
				assert.equal(response.status, 303);
				assert.equal(response.headers.get('location'), '/mtg/inventory');
				const cookie = response.headers
					.getSetCookie()
					.find((value) => value.startsWith('spellbook_session='));
				assert.ok(cookie);
				assert.match(cookie, /HttpOnly/i);
				assert.match(cookie, /SameSite=Lax/i);
				assert.equal(
					(await request('/mtg/inventory', undefined, { cookie: cookie.split(';')[0] })).status,
					200
				);
				const anonymous = await request('/mtg/inventory');
				assert.equal(anonymous.status, 302);
				assert.match(anonymous.headers.get('location') ?? '', /^\/auth\/login\?returnTo=/);
				const wrong = await fetch(url, {
					method: 'POST',
					headers: {
						origin,
						accept: 'text/html',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ username, password: 'wrong-password' }),
					redirect: 'manual'
				});
				assert.equal(wrong.status, 400);
				assert.match(await wrong.text(), /Invalid username or password/);
			}
		);
		await t.test(
			'account profile patches, session inspection and password rotation use the authenticated actor',
			async () => {
				const name = `account_${randomUUID().slice(0, 8)}`;
				const a = await (await request('/api/auth/register', { username: name, password })).json();
				const b = await (
					await request('/api/auth/register', {
						username: `other_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(a.user.accountId, b.user.accountId);
				const headers = { authorization: `Bearer ${a.token}` };
				const patch = (body: unknown, extra: Record<string, string> = {}) =>
					fetch(`${origin}/api/account/profile`, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json', ...headers, ...extra },
						body: JSON.stringify(body)
					});
				assert.equal((await request('/api/account/profile')).status, 401);
				const inspected = await (await request('/api/auth/session', undefined, headers)).json();
				assert.equal(inspected.expiresAt, a.expiresAt);
				assert.equal(inspected.token, undefined);
				assert.equal(inspected.user.accountId, a.user.accountId);
				const saves = await Promise.all([
					patch({ email: 'owner@example.test' }),
					patch({ avatarId: 'dragon' }),
					patch({ profileCard: { name: 'HTTP Collector' } }),
					patch({ profileCard: { flavorText: 'Independent field save' } })
				]);
				assert.ok(saves.every((response) => response.status === 200));
				assert.equal((await patch({ artworkId: 'tide' })).status, 200);
				const saved = await (await request('/api/account/profile', undefined, headers)).json();
				assert.equal(saved.user.email, 'owner@example.test');
				assert.equal(saved.user.avatarId, 'dragon');
				assert.equal(saved.user.artworkId, 'tide');
				assert.equal(saved.card.name, 'HTTP Collector');
				assert.equal(saved.card.flavorText, 'Independent field save');
				for (const body of [
					{ email: 'invalid' },
					{ avatarId: 'unknown' },
					{ artworkId: 'https://invalid.test/x.png' },
					{ profileCard: { rulesText: '{unsupported}' } },
					{ accountId: b.user.accountId, email: 'foreign@example.test' },
					{ profileCard: { accountId: b.user.accountId } }
				])
					assert.equal((await patch(body)).status, 400);
				const other = await (
					await request('/api/account/profile', undefined, { authorization: `Bearer ${b.token}` })
				).json();
				assert.equal(other.user.email, '');
				assert.notEqual(other.card.name, 'HTTP Collector');
				const second = await (
					await request('/api/auth/login', { username: name, password })
				).json();
				assert.equal(
					(
						await request(
							'/api/account/password',
							{ currentPassword: 'wrong-password', newPassword: 'new-profile-account-password' },
							headers
						)
					).status,
					400
				);
				assert.equal((await request('/api/auth/session', undefined, headers)).status, 200);
				const rotated = await request(
					'/api/account/password',
					{ currentPassword: password, newPassword: 'new-profile-account-password' },
					headers
				);
				assert.equal(rotated.status, 200);
				const replacement = await rotated.json();
				for (const token of [a.token, second.token])
					assert.equal(
						(await request('/api/auth/session', undefined, { authorization: `Bearer ${token}` }))
							.status,
						401
					);
				assert.equal((await request('/api/auth/login', { username: name, password })).status, 401);
				assert.equal(
					(
						await request('/api/auth/login', {
							username: name,
							password: 'new-profile-account-password'
						})
					).status,
					200
				);
				const next = { authorization: `Bearer ${replacement.token}` };
				assert.equal((await request('/api/account/profile', undefined, next)).status, 200);
				const dashboard = await request('/api/account/dashboard', undefined, next);
				assert.equal(dashboard.status, 200);
				const summary = await dashboard.json();
				assert.deepEqual(summary.recentEntries, []);
				assert.equal(summary.totals.total, 0);
				const cookie = `spellbook_session=${replacement.token}`;
				assert.equal(
					(
						await request('/api/account/profile', undefined, {
							cookie,
							authorization: 'Bearer invalid'
						})
					).status,
					401
				);
				assert.equal(
					(
						await patch(
							{ email: 'foreign-origin@example.test' },
							{ cookie, authorization: '', origin: 'https://foreign.test' }
						)
					).status,
					401
				);
				const csrf = await fetch(`${origin}/api/account/profile`, {
					method: 'PATCH',
					headers: { cookie, origin: 'https://foreign.test', 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'bad@example.test' })
				});
				assert.equal(csrf.status, 403);
				const cookieRotation = await request(
					'/api/account/password',
					{
						currentPassword: 'new-profile-account-password',
						newPassword: 'final-profile-account-password'
					},
					{ cookie, origin }
				);
				assert.equal(cookieRotation.status, 200);
				assert.ok(
					cookieRotation.headers
						.getSetCookie()
						.some((value) => value.startsWith('spellbook_session='))
				);
			}
		);
		await t.test(
			'native and enhanced Profile Card forms preserve disjoint changes, no-op saves and unchecked legendary state',
			async () => {
				const account = await (
					await request('/api/auth/register', {
						username: `forms_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(account.user.accountId);
				const cookie = `spellbook_session=${account.token}`;
				const read = async () => {
					const response = await request('/settings/profile-card', undefined, { cookie });
					assert.equal(response.status, 200);
					const html = await response.text();
					const value = /name="baselineCard" value="([^"]*)"/.exec(html)?.[1];
					assert.ok(value);
					const decoded = value
						.replace(/&quot;/g, '"')
						.replace(/&#39;/g, "'")
						.replace(/&lt;/g, '<')
						.replace(/&gt;/g, '>')
						.replace(/&amp;/g, '&');
					return { html, card: JSON.parse(decoded), baselineCard: decoded };
				};
				const initial = await read();
				const body = (
					card: Record<string, unknown>,
					baselineCard: string,
					artworkId = 'grove',
					baselineArtworkId = 'grove'
				) => {
					const form = new URLSearchParams({ artworkId, baselineArtworkId, baselineCard });
					for (const [key, value] of Object.entries(card)) {
						if (key === 'legendary') {
							if (value) form.set(key, 'on');
						} else form.set(key, String(value));
					}
					return form;
				};
				const post = (form: URLSearchParams) =>
					fetch(`${origin}/settings/profile-card`, {
						method: 'POST',
						headers: {
							cookie,
							origin,
							'content-type': 'application/x-www-form-urlencoded',
							accept: 'text/html'
						},
						body: form,
						redirect: 'manual'
					});
				assert.equal(
					(
						await post(
							body(
								{ ...initial.card, flavorText: 'Saved in the other tab' },
								initial.baselineCard,
								'tide'
							)
						)
					).status,
					200
				);
				assert.equal(
					(
						await post(
							body(
								{ ...initial.card, name: 'Native Collector', legendary: false },
								initial.baselineCard
							)
						)
					).status,
					200
				);
				const saved = await (await request('/api/account/profile', undefined, { cookie })).json();
				assert.equal(saved.card.name, 'Native Collector');
				assert.equal(saved.card.flavorText, 'Saved in the other tab');
				assert.equal(saved.card.legendary, false);
				assert.equal(saved.user.artworkId, 'tide');
				const current = await read();
				assert.equal(
					(await post(body(current.card, current.baselineCard, 'tide', 'tide'))).status,
					200
				);
				const partial = (legendary?: string) =>
					new URLSearchParams({
						partial: 'true',
						baselineCard: current.baselineCard,
						baselineArtworkId: 'tide',
						...(legendary ? { legendary } : {})
					});
				assert.equal((await post(partial())).status, 200);
				assert.equal((await post(partial('on'))).status, 200);
				assert.equal(
					(await (await request('/api/account/profile', undefined, { cookie })).json()).card
						.legendary,
					true
				);
				assert.equal((await post(partial('off'))).status, 200);
				assert.equal(
					(await (await request('/api/account/profile', undefined, { cookie })).json()).card
						.legendary,
					false
				);
				const invalid = partial();
				invalid.set('rulesText', '{unsupported}');
				const rejected = await post(invalid);
				assert.equal(rejected.status, 400);
				assert.match(await rejected.text(), /Native Collector/);
				const malformed = body(current.card, 'invalid', 'tide', 'tide');
				assert.equal((await post(malformed)).status, 400);
			}
		);
		await t.test(
			'built Dashboard HTTP response remains bounded over 50,000 actual-printing Inventory entries',
			{ skip: !process.env.TEST_SCALE_CATALOG_PATH },
			async () => {
				const account = await (
					await request('/api/auth/register', {
						username: `scale_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(account.user.accountId);
				await seedAccountScaleInventory(
					pool,
					account.user.accountId,
					process.env.TEST_SCALE_CATALOG_PATH!
				);
				const response = await request('/api/account/dashboard', undefined, {
					authorization: `Bearer ${account.token}`
				});
				assert.equal(response.status, 200);
				const text = await response.text();
				const summary = JSON.parse(text);
				assert.equal(summary.totals.total, 50000);
				assert.equal(summary.totals.printings, 10000);
				assert.equal(summary.recentEntries.length, 8);
				assert.ok(text.length < 30000);
				assert.equal(summary.inventoryCards, undefined);
				const page = await request('/mtg/dashboard', undefined, {
					cookie: `spellbook_session=${account.token}`
				});
				assert.equal(page.status, 200);
				assert.match(await page.text(), /50,000/);
			}
		);
		await t.test(
			'Profile Card stale native and enhanced merges return field errors and retain submitted drafts',
			async () => {
				const account = await (
					await request('/api/auth/register', {
						username: `merge_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(account.user.accountId);
				const cookie = `spellbook_session=${account.token}`;
				const patch = (profileCard: unknown) =>
					fetch(`${origin}/api/account/profile`, {
						method: 'PATCH',
						headers: {
							'content-type': 'application/json',
							authorization: `Bearer ${account.token}`
						},
						body: JSON.stringify({ profileCard })
					});
				assert.equal((await patch({ power: '1', toughness: '1' })).status, 200);
				const html = await (await request('/settings/profile-card', undefined, { cookie })).text();
				const encoded = /name="baselineCard" value="([^"]*)"/.exec(html)?.[1];
				assert.ok(encoded);
				const baselineCard = encoded
					.replace(/&quot;/g, '"')
					.replace(/&#39;/g, "'")
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&amp;/g, '&');
				const baseline = JSON.parse(baselineCard);
				const full = new URLSearchParams({
					baselineCard,
					baselineArtworkId: 'grove',
					artworkId: 'grove'
				});
				for (const [field, value] of Object.entries({ ...baseline, power: '2' })) {
					if (field === 'legendary') {
						if (value) full.set(field, 'on');
					} else full.set(field, String(value));
				}
				assert.equal((await patch({ power: '', toughness: '' })).status, 200);
				const submit = (body: URLSearchParams, enhanced = false) =>
					fetch(`${origin}/settings/profile-card`, {
						method: 'POST',
						headers: {
							cookie,
							origin,
							'content-type': 'application/x-www-form-urlencoded',
							accept: enhanced ? 'application/json' : 'text/html',
							...(enhanced ? { 'x-sveltekit-action': 'true' } : {})
						},
						body,
						redirect: 'manual'
					});
				const rejected = await submit(full);
				assert.equal(rejected.status, 400);
				const draftHtml = await rejected.text();
				assert.match(draftHtml, /Fill both Power and Toughness/);
				assert.match(draftHtml, /name="power"[^>]*value="2"/);
				assert.match(draftHtml, /name="toughness"[^>]*value="1"/);
				const staleEnhanced = await submit(
					new URLSearchParams({
						partial: 'true',
						power: '2',
						baselineCard,
						baselineArtworkId: 'grove'
					}),
					true
				);
				assert.equal(staleEnhanced.status, 400);
				const staleResult = await staleEnhanced.json();
				const staleValues = JSON.parse(staleResult.data);
				const staleDraft = staleValues[staleValues[0].card];
				assert.equal(staleValues[staleDraft.power], '2');
				assert.equal(staleValues[staleDraft.toughness], '1');

				assert.equal((await patch({ power: '1', toughness: '1' })).status, 200);
				const locker = await pool.connect();
				await locker.query('BEGIN');
				await locker.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
					account.user.accountId
				]);
				const pid = (await locker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]
					.pid;
				const pending = submit(
					new URLSearchParams({
						partial: 'true',
						power: '2',
						baselineCard,
						baselineArtworkId: 'grove'
					}),
					true
				);
				try {
					let blocked = false;
					const deadline = Date.now() + 10000;
					while (Date.now() < deadline) {
						blocked = (
							await pool.query<{ blocked: boolean }>(
								'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',
								[pid]
							)
						).rows[0].blocked;
						if (blocked) break;
						await new Promise((resolve) => setTimeout(resolve, 20));
					}
					assert.equal(blocked, true, 'enhanced merge waits after reading the old complete card');
					await locker.query(
						`UPDATE user_profiles SET profile_card=profile_card || '{"power":"","toughness":""}'::jsonb WHERE account_id=$1`,
						[account.user.accountId]
					);
					await locker.query('COMMIT');
					const race = await pending;
					assert.equal(race.status, 400);
					const result = await race.json();
					assert.equal(result.type, 'failure');
					const values = JSON.parse(result.data);
					const draft = values[values[0].card];
					assert.equal(values[draft.power], '2');
					assert.equal(values[draft.toughness], '1');
					const errors = values[values[0].errors];
					assert.match(values[errors.toughness], /Fill both Power and Toughness/);
				} finally {
					await locker.query('ROLLBACK');
					locker.release();
					await pending.catch(() => {});
				}
				const saved = await (await request('/api/account/profile', undefined, { cookie })).json();
				assert.equal(saved.card.power, '');
				assert.equal(saved.card.toughness, '');
			}
		);
		await t.test(
			'large permitted entry quantities produce exact aggregate JSON numbers',
			async () => {
				const account = await (
					await request('/api/auth/register', {
						username: `wide_${randomUUID().slice(0, 8)}`,
						password
					})
				).json();
				accounts.push(account.user.accountId);
				const { setCode } = await seedWideSummary(pool, account.user.accountId);
				const headers = { authorization: `Bearer ${account.token}` };
				const response = await request('/api/account/dashboard', undefined, headers);
				assert.equal(response.status, 200);
				const summary = (await response.json()) as DashboardSummary;
				assert.equal(summary.totals.total, 4294967294);
				assert.equal(summary.totals.foils, 2147483647);
				assert.deepEqual(summary.sets, [{ label: setCode, quantity: 4294967294, share: 1 }]);
				assert.deepEqual(
					summary.finishes.map((row) => [row.quantity, row.share]),
					[
						[2147483647, 0.5],
						[2147483647, 0.5]
					]
				);
				assert.equal(summary.conditions[0].quantity, 4294967294);
				assert.equal(summary.conditions[0].share, 1);
				assert.deepEqual(
					summary.decks
						.map(({ name, required, exact, alternate, missing }) => ({
							name,
							required,
							exact,
							alternate,
							missing
						}))
						.sort((a, b) => a.name.localeCompare(b.name)),
					[
						{ name: 'Missing', required: 4294967294, exact: 0, alternate: 0, missing: 4294967294 },
						{ name: 'Owned', required: 4294967294, exact: 4294967294, alternate: 0, missing: 0 }
					]
				);
				const settings = await request('/api/account/profile', undefined, headers);
				assert.equal(settings.status, 200);
				assert.equal((await settings.json()).totals.total, 4294967294);
			}
		);
	} finally {
		if (child) await stopHttpApplication(child);
		if (fixtureStarted && previous)
			await pool.query(
				'UPDATE catalog_state SET active_generation=$1,previous_generation=$2 WHERE id=1',
				[previous.active_generation, previous.previous_generation]
			);
		else if (fixtureStarted)
			await pool.query('DELETE FROM catalog_state WHERE active_generation=$1', [generation]);
		if (fixtureStarted)
			await pool.query('DELETE FROM catalog_generations WHERE id=$1', [generation]);
		if (accounts.length)
			await pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [accounts]);
		await pool.end();
	}
});
