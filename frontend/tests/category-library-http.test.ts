import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ensureDeckCatalogFixture } from './deck-catalog-fixture.ts';
import { publishCategoryCatalogFixture } from './fixtures/category-catalog.ts';
import { fixtureAuthRequest } from './fixtures/http-auth.ts';
import { httpTestOrigin, startHttpApplication, stopHttpApplication } from './http-runtime.ts';
import type {
	CategoryLibraryPage,
	CategoryPreview
} from '@spellbook/contracts/category-library.ts';
import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
import type { WholeCategoryAcknowledgement } from '@spellbook/contracts/whole-categories.ts';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (
	!databaseUrl ||
	databaseUrl !== process.env.DATABASE_URL ||
	new URL(databaseUrl).pathname !== `/${process.env.TEST_SCAN_DATABASE_NAME}`
)
	throw Error('Category Library HTTP requires an owned disposable database');
const origin = httpTestOrigin();
test('built native Category Library and API preserve immutable adoption and complete reviewed commits', async (t) => {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const accounts: string[] = [];
	let child: Awaited<ReturnType<typeof startHttpApplication>> | undefined;
	let restoreCatalog: (() => Promise<void>) | undefined;
	try {
		restoreCatalog = await publishCategoryCatalogFixture(pool);
		child = await startHttpApplication(origin, new URL('../', import.meta.url));
		const registered = await fixtureAuthRequest(
			origin,
			'/api/auth/register',
			{
				username: 'library_http_' + randomUUID().slice(0, 8),
				password: 'category-library-http-test-password'
			},
			{}
		);
		assert.equal(registered.status, 201);
		const session = await registered.json();
		accounts.push(session.user.accountId);
		const bearer = { authorization: `Bearer ${session.token}` },
			cookie = `spellbook_session=${session.token}`;
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
		const library = async () =>
			(await (
				await request('/api/mobile/v1/mtg/category-definitions')
			).json()) as CategoryLibraryPage;
		const state = async (deckId: string) =>
			(await (
				await request(`/api/mobile/v1/mtg/decks/${deckId}/categories`)
			).json()) as DeckEntryCategories;
		const makeDeck = async (name: string) => {
			const response = await request('/api/mobile/v1/mtg/decks', 'POST', {
				name,
				format: 'Modern',
				description: ''
			});
			assert.equal(response.status, 200);
			return (await response.json()).find(
				(deck: { name: string; id: string }) => deck.name === name
			).id as string;
		};
		const firstRequest = randomUUID();
		const input = {
			requestId: firstRequest,
			originId: '',
			expectedLibraryRevision: '0',
			scope: 'entry',
			name: 'Creatures',
			meaning: 'Creature type',
			priority: '0',
			displayOrder: '0',
			roles: 'main',
			rule: JSON.stringify({ op: 'type', value: 'Creature' }),
			'rule.root.op': 'type',
			'rule.root.value': 'Creature'
		};
		await t.test(
			'native GET and source choices never initialize; native save matches API adoption',
			async () => {
				const response = await request('/mtg/categories', 'GET', undefined, {
					cookie,
					purpose: 'prefetch'
				});
				assert.equal(response.status, 200);
				const html = await response.text();
				assert.match(html, /Category Library/);
				assert.match(html, /New reusable definition/);
				assert.doesNotMatch(html, /<textarea[^>]*name="rule"/);
				assert.equal((await library()).total, 0);
				assert.equal((await postForm('/mtg/categories?/save', input)).status, 303);
				assert.equal((await library()).definitions[0].current.name, 'Creatures');
			}
		);
		const first = (await library()).definitions[0],
			a = await makeDeck('Old adoption');
		const local = (await state(a)).definitions.find((d) => d.originId === first.originId)!;
		assert.ok(local);
		const card = await ensureDeckCatalogFixture(pool);
		const entryIds: string[] = [];
		for (const role of ['main', 'companion']) {
			const added = await request(`/api/mobile/v1/mtg/decks/${a}/cards`, 'POST', {
				...card,
				quantity: 1,
				role,
				requestId: randomUUID()
			});
			assert.equal(added.status, 200);
			entryIds.push((await added.json()).changes[0].entryId);
		}
		const manual = async (categoryId: string | null) => {
			for (const entryId of entryIds) {
				const response = await request(
					`/api/mobile/v1/mtg/deck-cards/${entryId}/category`,
					'PATCH',
					{
						requestId: randomUUID(),
						deckId: a,
						categoryId,
						expectedDecisionRevision: (await state(a)).decisionRevision
					}
				);
				assert.equal(response.status, 200);
			}
		};
		await manual(null);
		await t.test(
			'native stale label keeps the exact label, original revision and request identity',
			async () => {
				const requestId = randomUUID(),
					before = await state(a);
				const failed = await postForm(`/mtg/decks?/renameCategory&deck=${a}`, {
					requestId,
					deckId: a,
					categoryId: local.id,
					name: 'Held native label draft',
					expectedDecisionRevision: '0'
				});
				assert.equal(failed.status, 409);
				const html = await failed.text();
				assert.match(html, /Held native label draft/);
				const controls = html.match(
					/<form[^>]*action="[^"]*renameCategory[^"]*"[\s\S]*?<\/form>/
				)?.[0];
				assert.ok(controls);
				assert.match(controls, /name="expectedDecisionRevision" value="0"/);
				assert.ok(controls.includes(requestId));
				assert.deepEqual(await state(a), before);
			}
		);

		await t.test(
			'native stale removal retains its nonempty replacement and original intent until explicit rebase',
			async () => {
				const before = await state(a),
					requestId = randomUUID();
				const replacement = before.definitions.find((d) => d.id !== local.id)!;
				const intent = {
					requestId,
					deckId: a,
					categoryId: local.id,
					replacementCategoryId: replacement.id,
					expectedDecisionRevision: '0',
					confirmRemoval: 'yes'
				};
				const failed = await postForm(`/mtg/decks?/removeCategory&deck=${a}`, intent);
				assert.equal(failed.status, 409);
				const html = await failed.text();
				const controls = html.match(
					/<form[^>]*action="[^"]*removeCategory[^"]*"[\s\S]*?<\/form>/
				)?.[0];
				assert.ok(controls);
				assert.ok(controls.includes(requestId));
				assert.match(controls, /name="expectedDecisionRevision" value="0"/);
				assert.ok(controls.includes(`value="${replacement.id}" selected`));
				assert.match(controls, /Rebase removal to current categories/);
				assert.deepEqual(await state(a), before);
				const rebased = await postForm(`/mtg/decks?/rebaseRemoval&deck=${a}`, intent);
				assert.equal(rebased.status, 200);
				const updated = await rebased.text();
				assert.match(updated, /Removal draft rebased/);
				assert.ok(
					updated.includes(`name="expectedDecisionRevision" value="${before.decisionRevision}"`)
				);
				assert.deepEqual(await state(a), before);
			}
		);

		await t.test(
			'native uncertain removal retains original replacement, baseline and retry separately while explicit rebase leaves assignments untouched',
			async () => {
				const before = await state(a),
					requestId = randomUUID(),
					trigger = 'category16_remove_' + randomUUID().replaceAll('-', '');
				const replacement = before.definitions.find((d) => d.id !== local.id)!;
				const intent = {
					requestId,
					deckId: a,
					categoryId: local.id,
					replacementCategoryId: replacement.id,
					expectedDecisionRevision: before.decisionRevision,
					confirmRemoval: 'yes'
				};
				try {
					await pool.query(
						`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id='${requestId}' THEN PERFORM pg_sleep(6); END IF; RETURN NEW; END $$`
					);
					await pool.query(
						`CREATE TRIGGER ${trigger} BEFORE INSERT ON category_mutation_requests FOR EACH ROW EXECUTE FUNCTION ${trigger}()`
					);
					const failed = await postForm(`/mtg/decks?/removeCategory&deck=${a}`, intent);
					assert.equal(failed.status, 503);
					const html = await failed.text();
					assert.match(html, /Retry original removal/);
					const retry = html.match(
						/<form[^>]*action="[^"]*removeCategory[^"]*"[\s\S]*?<\/form>/
					)?.[0];
					assert.ok(retry);
					assert.ok(retry.includes(requestId));
					assert.ok(retry.includes(`name="replacementCategoryId" value="${replacement.id}"`));
					assert.ok(
						retry.includes(`name="expectedDecisionRevision" value="${before.decisionRevision}"`)
					);
					assert.deepEqual(await state(a), before);
					assert.equal(
						(
							await pool.query(
								'SELECT count(*)::int AS n FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
								[session.user.accountId, requestId]
							)
						).rows[0].n,
						0
					);
				} finally {
					await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON category_mutation_requests`);
					await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
				}
				const rebased = await postForm(`/mtg/decks?/rebaseRemoval&deck=${a}`, {
					...intent,
					retryDeckId: a,
					retryCategoryId: local.id,
					retryReplacementCategoryId: replacement.id,
					retryExpectedDecisionRevision: before.decisionRevision,
					retryRequestId: requestId
				});
				assert.equal(rebased.status, 200);
				const html = await rebased.text();
				assert.match(html, /Retry original removal/);
				assert.ok(html.includes(requestId));
				assert.deepEqual(await state(a), before);
			}
		);

		await t.test(
			'native immutable edit affects new decks while old labels and complete bundles stay fixed',
			async () => {
				const edit = await request(`/mtg/categories?edit=${first.originId}`, 'GET', undefined, {
					cookie
				});
				assert.equal(edit.status, 200);
				assert.match(await edit.text(), /Creature type/);
				assert.equal(
					(
						await postForm('/mtg/categories?/save', {
							...input,
							requestId: randomUUID(),
							originId: first.originId,
							expectedLibraryRevision: '1',
							name: 'New creatures'
						})
					).status,
					303
				);
				assert.equal(
					(await state(a)).definitions.find((d) => d.originId === first.originId)?.name,
					'Creatures'
				);
				const b = await makeDeck('Current adoption');
				assert.equal(
					(await state(b)).definitions.find((d) => d.originId === first.originId)?.name,
					'New creatures'
				);
				assert.equal((await state(b)).wholeDeckDefinitions?.length, 0);
			}
		);
		await t.test(
			'native local rename and Review use the same server-owned preview and full commit as API',
			async () => {
				const revision = (await state(a)).decisionRevision;
				const renameId = randomUUID();
				const renamed = await postForm(`/mtg/decks?/renameCategory&deck=${a}`, {
					requestId: renameId,
					deckId: a,
					categoryId: local.id,
					name: 'Only this deck',
					expectedDecisionRevision: revision
				});
				assert.equal(renamed.status, 200);
				assert.equal(
					(await state(a)).definitions.find((d) => d.id === local.id)?.name,
					'Only this deck'
				);
				assert.equal((await library()).definitions[0].current.name, 'New creatures');
				await manual(local.id);
				const creature = (
					await pool.query(
						"SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE p.lang='en' AND f.raw_oracle_id IS NOT NULL AND 'Creature'=ANY(f.types) ORDER BY p.id LIMIT 1"
					)
				).rows[0]?.document;
				assert.ok(creature);
				const added = await request(`/api/mobile/v1/mtg/decks/${a}/cards`, 'POST', {
					catalogCardId: creature.id,
					canonicalCardId: creature.oracle_id,
					name: creature.name,
					setCode: creature.set_code,
					imageUri: creature.image_uri,
					quantity: 1,
					role: 'main',
					requestId: randomUUID()
				});
				assert.equal(added.status, 200);
				const preservedManual = (await state(a)).decisions.filter((d) =>
					entryIds.includes(d.entryId)
				);
				const resetRequest = randomUUID();
				const resetResponse = await postForm(`/mtg/decks?/previewCategories&deck=${a}`, {
					requestId: resetRequest,
					deckId: a,
					scope: 'entry',
					mode: 'Reset'
				});
				assert.equal(resetResponse.status, 200);
				assert.match(
					await resetResponse.text(),
					/Before: Creatures \(Automatic\)\. After: New creatures \(Automatic\)/
				);
				// Keep this uncommitted native Reset out of later preview-capacity scenarios.
				await pool.query(
					"UPDATE category_change_previews SET expires_at=now()-interval '1 day' WHERE account_id=$1 AND request_id=$2",
					[session.user.accountId, resetRequest]
				);
				const previewRequest = randomUUID();
				const native = await postForm(`/mtg/decks?/previewCategories&deck=${a}`, {
					requestId: previewRequest,
					deckId: a,
					scope: 'entry',
					mode: 'Review'
				});
				assert.equal(native.status, 200);
				const html = await native.text();
				assert.match(html, /Save reviewed Review/);
				assert.match(html, /Before: Creatures \(Automatic\)\. After: New creatures \(Automatic\)/);
				assert.match(html, /Before: Creatures \(Manual\)\. After: Creatures \(Manual\)/);
				assert.match(html, /New creatures/);
				const replay = await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
					requestId: previewRequest,
					scope: 'entry',
					mode: 'Review',
					restoreOriginIds: []
				});
				assert.equal(replay.status, 200);
				const preview = (await replay.json()) as CategoryPreview;
				const commitRequest = randomUUID();
				const committed = await postForm(`/mtg/decks?/commitCategories&deck=${a}`, {
					requestId: commitRequest,
					deckId: a,
					previewId: preview.id,
					confirmPreview: 'yes'
				});
				assert.equal(committed.status, 200);
				assert.equal(
					(await state(a)).definitions.find((d) => d.id === local.id)?.name,
					'New creatures'
				);
				assert.deepEqual(
					(await state(a)).decisions.filter((d) => entryIds.includes(d.entryId)),
					preservedManual
				);
				const ack = await request(
					`/api/mobile/v1/mtg/category-previews/${preview.id}/commit`,
					'POST',
					{ requestId: commitRequest }
				);
				assert.equal(ack.status, 200);
			}
		);

		await t.test(
			'native commit retains its authoritative receipt and draft controls when actual PG evidence and full page follow-up reads fail',
			async () => {
				const response = await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
					requestId: randomUUID(),
					scope: 'entry',
					mode: 'Review',
					restoreOriginIds: []
				});
				assert.equal(response.status, 200);
				const preview = (await response.json()) as CategoryPreview;
				const requestId = randomUUID(),
					trigger = 'category16_native_' + randomUUID().replaceAll('-', '');
				try {
					await pool.query(
						`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id='${requestId}' THEN ALTER TABLE category_preview_differences RENAME TO category16_native_differences_hold; ALTER TABLE oracle_tag_state RENAME TO category16_native_oracle_hold; ALTER TABLE inventory_cards RENAME TO category16_native_inventory_hold; END IF; RETURN NEW; END $$`
					);
					await pool.query(
						`CREATE TRIGGER ${trigger} AFTER INSERT ON category_mutation_requests FOR EACH ROW EXECUTE FUNCTION ${trigger}()`
					);
					const committed = await postForm(`/mtg/decks?/commitCategories&deck=${a}`, {
						requestId,
						deckId: a,
						previewId: preview.id,
						confirmPreview: 'yes'
					});
					assert.equal(committed.status, 200);
					const html = await committed.text();
					assert.match(html, /Complete reviewed category change saved/);
					assert.match(html, /Committed/);
					assert.match(html, /Current category evidence is unavailable/);
					assert.match(html, /Manage adopted categories/);
					assert.match(html, /<fieldset disabled/);
					assert.ok(html.includes(requestId));
					const receipt = (
						await pool.query(
							'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
							[session.user.accountId, requestId]
						)
					).rows[0]?.acknowledgement;
					assert.equal(receipt.requestId, requestId);
				} finally {
					for (const [held, name] of [
						['category16_native_inventory_hold', 'inventory_cards'],
						['category16_native_oracle_hold', 'oracle_tag_state'],
						['category16_native_differences_hold', 'category_preview_differences']
					]) {
						if ((await pool.query('SELECT to_regclass($1) AS relation', [held])).rows[0].relation)
							await pool.query(`ALTER TABLE ${held} RENAME TO ${name}`);
					}
					await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON category_mutation_requests`);
					await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
				}
				const replay = await request(
					`/api/mobile/v1/mtg/category-previews/${preview.id}/commit`,
					'POST',
					{ requestId }
				);
				assert.equal(replay.status, 200);
				assert.equal((await replay.json()).requestId, requestId);
			}
		);

		await t.test(
			'native confirmed label retains its submitted controls and advances only the acknowledged base when actual follow-up reads fail',
			async () => {
				const requestId = randomUUID(),
					before = await state(a),
					trigger = 'category16_label_' + randomUUID().replaceAll('-', '');
				try {
					await pool.query(
						`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id='${requestId}' THEN ALTER TABLE oracle_tag_state RENAME TO category16_native_oracle_hold; ALTER TABLE inventory_cards RENAME TO category16_native_inventory_hold; END IF; RETURN NEW; END $$`
					);
					await pool.query(
						`CREATE TRIGGER ${trigger} AFTER INSERT ON category_mutation_requests FOR EACH ROW EXECUTE FUNCTION ${trigger}()`
					);
					const response = await postForm(`/mtg/decks?/renameCategory&deck=${a}`, {
						requestId,
						deckId: a,
						categoryId: local.id,
						name: 'Confirmed native label draft',
						expectedDecisionRevision: before.decisionRevision
					});
					assert.equal(response.status, 200);
					const html = await response.text();
					assert.match(html, /Local label saved/);
					assert.match(html, /Current category evidence is unavailable/);
					const controls = html.match(
						/<form[^>]*action="[^"]*renameCategory[^"]*"[\s\S]*?<\/form>/
					)?.[0];
					assert.ok(controls);
					assert.match(controls, /Confirmed native label draft/);
					const receipt = (
						await pool.query(
							'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
							[session.user.accountId, requestId]
						)
					).rows[0].acknowledgement;
					assert.ok(
						controls.includes(`name="expectedDecisionRevision" value="${receipt.decisionRevision}"`)
					);
					assert.ok(!controls.includes(requestId));
				} finally {
					for (const [held, name] of [
						['category16_native_inventory_hold', 'inventory_cards'],
						['category16_native_oracle_hold', 'oracle_tag_state']
					])
						if ((await pool.query('SELECT to_regclass($1) AS relation', [held])).rows[0].relation)
							await pool.query(`ALTER TABLE ${held} RENAME TO ${name}`);
					await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON category_mutation_requests`);
					await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
				}
			}
		);

		await t.test(
			'native removal keeps its confirmed receipt when actual full-page and category follow-up reads fail',
			async () => {
				const deckId = await makeDeck('Removal receipt'),
					before = await state(deckId);
				const removed = before.definitions.find((d) => d.originId === first.originId)!;
				const requestId = randomUUID(),
					trigger = 'category16_remove_ack_' + randomUUID().replaceAll('-', '');
				const intent = {
					requestId,
					deckId,
					categoryId: removed.id,
					replacementCategoryId: '',
					expectedDecisionRevision: before.decisionRevision,
					confirmRemoval: 'yes'
				};
				try {
					await pool.query(
						`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_id='${requestId}' THEN ALTER TABLE oracle_tag_state RENAME TO category16_native_oracle_hold; ALTER TABLE inventory_cards RENAME TO category16_native_inventory_hold; END IF; RETURN NEW; END $$`
					);
					await pool.query(
						`CREATE TRIGGER ${trigger} AFTER INSERT ON category_mutation_requests FOR EACH ROW EXECUTE FUNCTION ${trigger}()`
					);
					const response = await postForm(`/mtg/decks?/removeCategory&deck=${deckId}`, intent);
					assert.equal(response.status, 200);
					const html = await response.text();
					assert.match(html, /Local category removed and replacement saved/);
					assert.match(html, /Current category evidence is unavailable/);
					assert.doesNotMatch(html, /Retry original removal/);
					const receipt = (
						await pool.query(
							'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
							[session.user.accountId, requestId]
						)
					).rows[0].acknowledgement;
					assert.equal(receipt.requestId, requestId);
					assert.equal(receipt.deckId, deckId);
				} finally {
					for (const [held, name] of [
						['category16_native_inventory_hold', 'inventory_cards'],
						['category16_native_oracle_hold', 'oracle_tag_state']
					])
						if ((await pool.query('SELECT to_regclass($1) AS relation', [held])).rows[0].relation)
							await pool.query(`ALTER TABLE ${held} RENAME TO ${name}`);
					await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON category_mutation_requests`);
					await pool.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
				}
				assert.equal(
					(await postForm(`/mtg/decks?/removeCategory&deck=${deckId}`, intent)).status,
					200
				);
				assert.ok(!(await state(deckId)).definitions.some((d) => d.id === removed.id));
			}
		);

		await t.test(
			'native removal preserves all-role Manual replacement and Reset releases it while explicit restoration preserves later Manual choices',
			async () => {
				await manual(local.id);
				const removed = await postForm(`/mtg/decks?/removeCategory&deck=${a}`, {
					requestId: randomUUID(),
					deckId: a,
					categoryId: local.id,
					replacementCategoryId: '',
					expectedDecisionRevision: (await state(a)).decisionRevision,
					confirmRemoval: 'yes'
				});
				assert.equal(removed.status, 200);
				const after = await state(a);
				assert.ok(after.suppressedOrigins?.some((d) => d.originId === first.originId));
				for (const entryId of entryIds) {
					const decision = after.decisions.find((d) => d.entryId === entryId)!;
					assert.equal(decision.state, 'Manual');
					assert.equal(decision.categoryId, null);
				}
				const resetId = randomUUID();
				assert.equal(
					(
						await postForm(`/mtg/decks?/previewCategories&deck=${a}`, {
							requestId: resetId,
							deckId: a,
							scope: 'entry',
							mode: 'Reset'
						})
					).status,
					200
				);
				const reset = await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
					requestId: resetId,
					scope: 'entry',
					mode: 'Reset',
					restoreOriginIds: []
				});
				const resetPreview = (await reset.json()) as CategoryPreview;
				assert.equal(reset.status, 200);
				assert.equal(
					(
						await postForm(`/mtg/decks?/commitCategories&deck=${a}`, {
							requestId: randomUUID(),
							deckId: a,
							previewId: resetPreview.id,
							confirmPreview: 'yes'
						})
					).status,
					200
				);
				for (const entryId of entryIds)
					assert.notEqual(
						(await state(a)).decisions.find((d) => d.entryId === entryId)?.state,
						'Manual'
					);
				assert.ok(!(await state(a)).definitions.some((d) => d.originId === first.originId));
				await manual(null);
				const restore = await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
					requestId: randomUUID(),
					scope: 'entry',
					mode: 'Review',
					restoreOriginIds: [first.originId]
				});
				assert.equal(restore.status, 200);
				const restored = (await restore.json()) as CategoryPreview;
				assert.equal(
					(
						await request(`/api/mobile/v1/mtg/category-previews/${restored.id}/commit`, 'POST', {
							requestId: randomUUID()
						})
					).status,
					200
				);
				assert.ok((await state(a)).definitions.some((d) => d.originId === first.originId));
				for (const entryId of entryIds)
					assert.equal(
						(await state(a)).decisions.find((d) => d.entryId === entryId)?.state,
						'Manual'
					);
			}
		);
		await t.test(
			'native criteria updates preserve metadata without writing a version; invalid/stale drafts remain visible',
			async () => {
				const before = await library();
				const update = await postForm('/mtg/categories?/save', {
					...input,
					requestId: randomUUID(),
					originId: first.originId,
					expectedLibraryRevision: before.revision,
					name: 'Unsaved meaning',
					'rule.root.op': 'keyword',
					ruleAction: 'update'
				});
				assert.equal(update.status, 200);
				const html = await update.text();
				assert.match(html, /Unsaved meaning/);
				assert.match(html, /Printed keyword/);
				assert.equal((await library()).revision, before.revision);
				const stale = await postForm('/mtg/categories?/save', {
					...input,
					requestId: randomUUID(),
					originId: first.originId,
					name: 'Retained stale draft',
					expectedLibraryRevision: '0'
				});
				assert.equal(stale.status, 409);
				assert.match(await stale.text(), /Retained stale draft/);
			}
		);

		await t.test(
			'native archive changes future adoption and keeps prior Deck bundles and decisions intact',
			async () => {
				const before = await state(a),
					revision = (await library()).revision,
					requestId = randomUUID();
				assert.equal(
					(
						await postForm('/mtg/categories?/archive', {
							requestId,
							originId: first.originId,
							archived: 'true',
							expectedLibraryRevision: revision
						})
					).status,
					303
				);
				assert.deepEqual(await state(a), before);
				const next = await makeDeck('After archive');
				assert.ok(!(await state(next)).definitions.some((d) => d.originId === first.originId));
			}
		);
		await t.test(
			'enhanced immutable save returns its confirmed backend receipt independently of a subsequent page read',
			async () => {
				const requestId = randomUUID(),
					revision = (await library()).revision;
				const submitted = {
					...input,
					requestId,
					name: 'Enhanced receipt',
					expectedLibraryRevision: revision
				};
				const response = await fetch(origin + '/mtg/categories?/save', {
					method: 'POST',
					headers: {
						cookie,
						origin,
						accept: 'application/json',
						'x-sveltekit-action': 'true',
						'content-type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams(submitted),
					redirect: 'manual'
				});
				assert.equal(response.status, 200);
				const result = await response.json();
				assert.equal(result.type, 'success');
				assert.match(result.data, /acknowledgement/);
				assert.ok(result.data.includes(requestId));
				assert.equal(
					(await library()).definitions.some((d) => d.current.name === 'Enhanced receipt'),
					true
				);
			}
		);

		await t.test(
			'HTTP whole Review commits its scoped receipt before capacity checks and revocation blocks replay',
			async () => {
				const body = {
					requestId: randomUUID(),
					scope: 'deck',
					mode: 'Review',
					restoreOriginIds: []
				};
				const before = await state(a);
				const reviewed = await request(
					`/api/mobile/v1/mtg/decks/${a}/category-previews`,
					'POST',
					body
				);
				assert.equal(reviewed.status, 200);
				const wholePreview = (await reviewed.json()) as CategoryPreview;
				assert.equal(wholePreview.scope, 'deck');
				assert.equal(wholePreview.status, 'Ready');
				assert.equal(wholePreview.total, 0);
				assert.deepEqual(wholePreview.differences, []);
				const commitPath = `/api/mobile/v1/mtg/category-previews/${wholePreview.id}/commit`,
					commitInput = { requestId: randomUUID() };
				const committed = await request(commitPath, 'POST', commitInput);
				assert.equal(committed.status, 200);
				const acknowledgement: WholeCategoryAcknowledgement = await committed.json();
				assert.deepEqual(acknowledgement, {
					requestId: commitInput.requestId,
					deckId: a,
					scope: 'deck',
					decisionRevision: before.decisionRevision,
					versionIds: [],
					changed: false
				});
				const replay = await request(commitPath, 'POST', commitInput);
				assert.equal(replay.status, 200);
				assert.deepEqual(await replay.json(), acknowledgement);
				assert.deepEqual(await state(a), before);
				for (let i = 0; i < 4; i++)
					assert.equal(
						(
							await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
								...body,
								requestId: randomUUID(),
								scope: 'entry'
							})
						).status,
						200
					);
				const full = await request(`/api/mobile/v1/mtg/decks/${a}/category-previews`, 'POST', {
					...body,
					requestId: randomUUID(),
					scope: 'entry'
				});
				assert.equal(full.status, 503);
				assert.equal((await full.json()).kind, 'CategoryPreviewCapacity');
				assert.equal(
					(
						await request('/api/mobile/v1/mtg/category-definitions', 'POST', {
							accountId: session.user.accountId
						})
					).status,
					400
				);
				const logout = await request('/api/auth/logout', 'POST');
				assert.equal(logout.status, 204);
				assert.equal((await request(commitPath, 'POST', commitInput)).status, 401);
				assert.equal((await request('/api/mobile/v1/mtg/category-definitions')).status, 401);
			}
		);
	} finally {
		try {
			if (child) await stopHttpApplication(child);
			for (const account of accounts)
				await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
		} finally {
			try {
				await restoreCatalog?.();
			} finally {
				await pool.end();
			}
		}
	}
});
