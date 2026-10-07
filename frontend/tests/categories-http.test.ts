import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';
import type { DeckEntryCategories, CategoryMergePreview } from '@spellbook/contracts/categories.ts';
import type { DeckAcknowledgement } from '@spellbook/contracts/decks.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL)
	throw Error('Category HTTP tests require the same disposable DATABASE_URL and TEST_DATABASE_URL');
const origin = httpTestOrigin();
test('built category HTTP and native forms share authorized commands and reviewed merges', async (t) => {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const accounts: string[] = [];
	let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	try {
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		const card = await ensureDeckCatalogFixture(pool);
		const registration = await fixtureAuthRequest(
			origin,
			'/api/auth/register',
			{
				username: 'category_http_' + randomUUID().slice(0, 8),
				password: 'category-http-test-password'
			},
			{}
		);
		assert.equal(registration.status, 201);
		const session = await registration.json();
		accounts.push(session.user.accountId);
		const cookie = `spellbook_session=${session.token}`;
		const bearer = { authorization: `Bearer ${session.token}` };
		const request = (
			path: string,
			method = 'GET',
			body?: unknown,
			headers: Record<string, string> = bearer
		) =>
			fetch(origin + path, {
				method,
				headers: {
					...headers,
					...(body === undefined ? {} : { 'content-type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				redirect: 'manual'
			});
		const postForm = (path: string, body: Record<string, string>) =>
			fetch(origin + path, {
				method: 'POST',
				headers: {
					cookie,
					origin,
					accept: 'text/html',
					'content-type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams(body),
				redirect: 'manual'
			});
		const deckId = randomUUID();
		await pool.query(
			"INSERT INTO decks(id,account_id,game,name,format) VALUES($1,$2,'mtg','Legacy category HTTP','Modern')",
			[deckId, session.user.accountId]
		);
		const categoriesPath = `/api/mobile/v1/mtg/decks/${deckId}/categories`;
		const state = async () => (await (await request(categoriesPath)).json()) as DeckEntryCategories;
		await t.test(
			'GET and prefetch stay pure while native initialization is an explicit POST',
			async () => {
				assert.equal((await state()).initialized, false);
				const html = await (
					await request(`/mtg/decks?deck=${deckId}&group=category`, 'GET', undefined, {
						cookie,
						purpose: 'prefetch'
					})
				).text();
				assert.match(html, /data-initialize-categories/);
				assert.match(html, /Initialize categories/);
				assert.equal((await state()).initialized, false);
				assert.equal(
					(
						await request(
							categoriesPath + '/initialize',
							'POST',
							{ requestId: randomUUID() },
							{ cookie, origin: 'https://foreign.test' }
						)
					).status,
					403
				);
				const requestId = randomUUID();
				const initialized = await postForm(
					`/mtg/decks?/initializeCategories&deck=${deckId}&group=category`,
					{ deckId, requestId }
				);
				assert.equal(initialized.status, 200);
				assert.equal((await state()).definitions.length, 8);
				const replay = await request(categoriesPath + '/initialize', 'POST', { requestId });
				assert.equal(replay.status, 200);
				assert.deepEqual((await replay.json()).entryIds, []);
				assert.equal(
					(
						await request(categoriesPath + '/initialize', 'POST', {
							requestId: randomUUID(),
							automatic: true
						})
					).status,
					400
				);
			}
		);
		const add = async (role: string, quantity: number) =>
			(await (
				await request(`/api/mobile/v1/mtg/decks/${deckId}/cards`, 'POST', {
					...card,
					quantity,
					role,
					requestId: randomUUID()
				})
			).json()) as DeckAcknowledgement;
		const main = (await add('main', 2)).changes[0].entryId;
		const side = (await add('sideboard', 3)).changes[0].entryId;
		await t.test(
			'manual Uncategorized uses native and API parity, rejects stale/foreign authority, and survives quantity edits',
			async () => {
				const before = await state();
				assert.ok(
					['Automatic', 'Pending'].includes(
						before.decisions.find((d) => d.entryId === main)?.state ?? ''
					)
				);
				const native = await postForm(`/mtg/decks?/setCategory&deck=${deckId}&group=category`, {
					deckId,
					entryId: main,
					categoryId: '',
					expectedDecisionRevision: before.decisionRevision,
					requestId: randomUUID()
				});
				assert.equal(native.status, 200);
				const latest = await state();
				assert.equal(latest.decisions.find((d) => d.entryId === main)?.state, 'Manual');
				const stale = await request(`/api/mobile/v1/mtg/deck-cards/${main}/category`, 'PATCH', {
					deckId,
					categoryId: null,
					expectedDecisionRevision: before.decisionRevision,
					requestId: randomUUID()
				});
				assert.equal(stale.status, 409);
				assert.equal((await stale.json()).kind, 'CategoryConflict');
				const unsupported = await request(
					`/api/mobile/v1/mtg/deck-cards/${main}/category`,
					'PATCH',
					{
						deckId,
						categoryId: null,
						expectedDecisionRevision: latest.decisionRevision,
						requestId: randomUUID(),
						accountId: session.user.accountId
					}
				);
				assert.equal(unsupported.status, 400);
				const foreign = await fixtureAuthRequest(
					origin,
					'/api/auth/register',
					{
						username: 'category_foreign_' + randomUUID().slice(0, 8),
						password: 'category-http-test-password'
					},
					{}
				);
				const second = await foreign.json();
				accounts.push(second.user.accountId);
				assert.equal(
					(
						await request(categoriesPath, 'GET', undefined, {
							authorization: `Bearer ${second.token}`
						})
					).status,
					404
				);
				const draw = latest.definitions.find((d) => d.origin === 'draw');
				assert.ok(draw);
				assert.equal(
					(
						await request(`/api/mobile/v1/mtg/deck-cards/${main}/category`, 'PATCH', {
							deckId,
							categoryId: draw.id,
							expectedDecisionRevision: latest.decisionRevision,
							requestId: randomUUID()
						})
					).status,
					200
				);
				const savedDraw = await state();
				const draft = {
					deckId,
					entryId: main,
					categoryId: '',
					expectedDecisionRevision: latest.decisionRevision,
					requestId: randomUUID()
				};
				const rejected = await postForm(
					`/mtg/decks?/setCategory&deck=${deckId}&group=category`,
					draft
				);
				assert.equal(rejected.status, 409);
				const failedHtml = await rejected.text();
				assert.match(failedHtml, /Apply choice to latest revision/);
				assert.match(failedHtml, /<option value="" selected/);
				assert.equal(
					(
						await postForm(`/mtg/decks?/setCategory&deck=${deckId}&group=category`, {
							...draft,
							rebaseCategory: savedDraw.decisionRevision
						})
					).status,
					200
				);
				const preservedManual = (await state()).decisions.find((d) => d.entryId === main);
				await request(`/api/mobile/v1/mtg/deck-cards/${main}`, 'PATCH', {
					quantity: 4,
					requestId: randomUUID()
				});
				assert.deepEqual(
					(await state()).decisions.find((d) => d.entryId === main),
					preservedManual
				);
			}
		);
		await t.test(
			'confirmed category acknowledgement survives a failed current page read and later recovery',
			async () => {
				const before = await state();
				const draw = before.definitions.find((d) => d.origin === 'draw');
				assert.ok(draw);
				const requestId = randomUUID();
				const input = {
					deckId,
					entryId: main,
					categoryId: draw.id,
					expectedDecisionRevision: before.decisionRevision,
					requestId
				};
				const action = await fetch(`${origin}/mtg/decks?/setCategory&deck=${deckId}`, {
					method: 'POST',
					headers: {
						cookie,
						origin,
						accept: 'application/json',
						'x-sveltekit-action': 'true',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams(input),
					redirect: 'manual'
				});
				assert.equal(action.status, 200);
				const result = await action.json();
				assert.equal(result.type, 'success');
				assert.match(result.data, /acknowledgement/);
				const originalReceipt = await (
					await request(`/api/mobile/v1/mtg/deck-cards/${main}/category`, 'PATCH', {
						deckId,
						categoryId: draw.id,
						expectedDecisionRevision: before.decisionRevision,
						requestId
					})
				).json();
				await pool.query('ALTER TABLE oracle_tag_state RENAME TO category_http_source_hold');
				try {
					const unavailable = await request(`/mtg/decks?deck=${deckId}`, 'GET', undefined, {
						cookie
					});
					assert.equal(unavailable.status, 500);
				} finally {
					await pool.query('ALTER TABLE category_http_source_hold RENAME TO oracle_tag_state');
				}
				const recovered = await state();
				assert.equal(recovered.decisions.find((d) => d.entryId === main)?.categoryId, draw.id);
				assert.equal(recovered.decisions.find((d) => d.entryId === main)?.state, 'Manual');
				const retry = await request(`/api/mobile/v1/mtg/deck-cards/${main}/category`, 'PATCH', {
					deckId,
					categoryId: draw.id,
					expectedDecisionRevision: before.decisionRevision,
					requestId
				});
				assert.deepEqual(await retry.json(), originalReceipt);
				await request(`/api/mobile/v1/mtg/deck-cards/${main}/category`, 'PATCH', {
					deckId,
					categoryId: null,
					expectedDecisionRevision: recovered.decisionRevision,
					requestId: randomUUID()
				});
			}
		);
		await t.test(
			'a stale conflicting merge returns a new preview and native confirmation retains destination provenance',
			async () => {
				const before = await state();
				const draw = before.definitions.find((d) => d.origin === 'draw');
				assert.ok(draw);
				const saved = await request(`/api/mobile/v1/mtg/deck-cards/${side}/category`, 'PATCH', {
					deckId,
					categoryId: draw.id,
					expectedDecisionRevision: before.decisionRevision,
					requestId: randomUUID()
				});
				assert.equal(saved.status, 200);
				const draft = {
					entryId: main,
					catalogCardId: card.catalogCardId,
					quantity: '4',
					role: 'sideboard',
					requestId: randomUUID()
				};
				const conflict = await postForm(
					`/mtg/decks?/changePrinting&deck=${deckId}&group=category`,
					draft
				);
				assert.equal(conflict.status, 409);
				const html = await conflict.text();
				assert.match(html, /data-category-merge-review/);
				assert.match(html, /Resulting quantity: 7/);
				assert.match(html, /Confirm merge/);
				const preview = (await (
					await request(categoriesPath + '/merge-preview', 'POST', {
						entryId: main,
						catalogCardId: card.catalogCardId,
						quantity: 4,
						role: 'sideboard'
					})
				).json()) as CategoryMergePreview;
				await request(`/api/mobile/v1/mtg/deck-cards/${side}`, 'PATCH', {
					quantity: 5,
					requestId: randomUUID()
				});
				const stale = await request(`/api/mobile/v1/mtg/deck-cards/${main}`, 'PATCH', {
					role: 'sideboard',
					requestId: randomUUID(),
					categoryPreview: preview.token
				});
				assert.equal(stale.status, 409);
				assert.equal((await stale.json()).kind, 'CategoryMergeConflict');
				const current = (await (
					await request(categoriesPath + '/merge-preview', 'POST', {
						entryId: main,
						catalogCardId: card.catalogCardId,
						quantity: 4,
						role: 'sideboard'
					})
				).json()) as CategoryMergePreview;
				const destination = (await state()).decisions.find((d) => d.entryId === side);
				const confirmation = await postForm(
					`/mtg/decks?/changePrinting&deck=${deckId}&group=category`,
					{ ...draft, categoryPreview: current.token }
				);
				assert.equal(confirmation.status, 200);
				const after = await state();
				assert.deepEqual(after.decisions, [destination]);
				const snapshot = await (await request(`/api/mobile/v1/mtg/decks?deck=${deckId}`)).json();
				assert.equal(snapshot.deckCards.length, 1);
				assert.equal(snapshot.deckCards[0].quantity, 9);
				assert.equal(snapshot.deckCards[0].id, side);
				const rendered = await (
					await request(`/mtg/decks?deck=${deckId}&group=category`, 'GET', undefined, { cookie })
				).text();
				assert.doesNotMatch(rendered, new RegExp(`data-entry-category="${side}"`));
			}
		);
	} finally {
		if (child) await stopHttpApplication(child);
		for (const account of accounts)
			await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
		await pool.end();
	}
});
