import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { publishCategoryCatalogFixture } from '../fixtures/category-catalog.ts';
import { cpus, totalmem } from 'node:os';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks,
	createCategories
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { describeCategoryConsequence } from '../../src/lib/categories/preview-label.ts';
import type { SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';
import type { WholeCategoryAcknowledgement } from '@spellbook/contracts/whole-categories.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('server-owned Category Review, Reset and local decisions', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		categories: ReturnType<typeof createCategories>,
		decks: ReturnType<typeof createDecks>,
		actor: AuthUser;
	let restoreCatalog: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		restoreCatalog = await publishCategoryCatalogFixture(database.pool);
		auth = createLocalAuth(database.db, { demoMode: false });
		categories = createCategories(database.db, auth);
		decks = createDecks(database.db, createCatalog(database.pool), auth);
	}, 60_000);
	beforeEach(async () => {
		const account = await auth.authenticate(
			'register',
			'preview16_' + randomUUID().slice(0, 8),
			'category-preview-integration-password'
		);
		if (!account) throw Error('Register');
		actor = account.user;
	});
	afterEach(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
	});
	afterAll(async () => {
		try {
			await restoreCatalog?.();
		} finally {
			await database.pool.end();
		}
	});
	it('first Review of unchanged empty current and legacy starter bundles is a revision and notification no-op', async () => {
		for (const legacy of [false, true]) {
			const d = await deck();
			if (legacy)
				await database.pool.query(
					"UPDATE deck_category_bundles SET definitions=(SELECT jsonb_agg(x-'originId'-'automaticEligible') FROM jsonb_array_elements(definitions) x) WHERE deck_id=$1",
					[d.id]
				);
			const before = await categories.getDeckEntryCategories(actor, d.id);
			const listener = await database.pool.connect(),
				notifications: string[] = [];
			const received = (value: { payload?: string }) => {
				if (value.payload?.includes(actor.accountId)) notifications.push(value.payload);
			};
			listener.on('notification', received);
			await listener.query('LISTEN spellbook_saved_state');
			try {
				const p = await preview(d.id);
				expect(p.total).toBe(0);
				expect(p.differences).toEqual([]);
				const requestId = randomUUID();
				const committed = await categories.commitCategoryChange(actor, {
					requestId,
					previewId: p.id
				});
				expect(committed.decisionRevision).toBe(before.decisionRevision);
				if (!('entryIds' in committed)) throw new Error('Expected entry acknowledgement');
				expect(committed.entryIds).toEqual([]);
				expect(await categories.getDeckEntryCategories(actor, d.id)).toEqual(before);
				await listener.query('SELECT 1');
				await new Promise((resolve) => setTimeout(resolve, 50));
				expect(notifications).toEqual([]);
				expect(
					await categories.commitCategoryChange(actor, { requestId, previewId: p.id })
				).toEqual(committed);
			} finally {
				await listener.query('UNLISTEN spellbook_saved_state');
				listener.removeListener('notification', received);
				listener.release();
			}
		}
	});
	async function save(name = 'Artifacts', existing?: { originId: string; revision: string }) {
		const revision = existing?.revision ?? (await categories.getLibrary(actor)).revision;
		const input: SaveDefinitionInput = {
			requestId: randomUUID(),
			originId: existing?.originId ?? null,
			expectedLibraryRevision: revision,
			scope: 'entry',
			name,
			meaning: 'Artifact type',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			rule: { op: 'type', value: 'Artifact' },
			confirmRetainedRule: true
		};
		return categories.saveDefinition(actor, input);
	}
	async function deck() {
		return decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Review fixture',
			description: 'Keep description',
			format: 'Modern'
		});
	}
	async function card() {
		const row = (
			await database.pool.query(
				"SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE f.raw_oracle_id IS NOT NULL AND p.lang='en' AND 'Artifact'=ANY(f.types) ORDER BY p.id LIMIT 1"
			)
		).rows[0];
		if (!row) throw Error('Genuine Artifact missing');
		const d = row.document;
		return {
			catalogCardId: d.id,
			canonicalCardId: d.oracle_id,
			name: d.name,
			setCode: d.set_code,
			imageUri: d.image_uri
		};
	}
	async function preview(
		deckId: string,
		mode: 'Review' | 'Reset' = 'Review',
		restoreOriginIds: string[] = []
	) {
		return categories.previewCategoryChange(actor, {
			requestId: randomUUID(),
			deckId,
			mode,
			scope: 'entry',
			restoreOriginIds
		});
	}
	it('retains historical Manual provenance through same-origin version adoption and releases it only on Reset', async () => {
		const first = await save(),
			d = await deck(),
			c = await card();
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card: c, role: 'main', quantity: 1 }]
		});
		let state = await categories.getDeckEntryCategories(actor, d.id);
		const local = state.definitions.find((v) => v.originId === first.originId)!;
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[0].entryId,
			categoryId: local.id,
			expectedDecisionRevision: state.decisionRevision
		});
		const manual = (await categories.getDeckEntryCategories(actor, d.id)).decisions[0];
		const second = await save('Reviewed artifacts', {
			originId: first.originId,
			revision: first.libraryRevision
		});
		const p = await preview(d.id);
		expect(p.status).toBe('Ready');
		const preserved = p.differences.find((v) => v.kind === 'EntryPreserved');
		expect(describeCategoryConsequence(preserved?.before)).toBe('Artifacts (Manual)');
		expect(describeCategoryConsequence(preserved?.after)).toBe('Artifacts (Manual)');
		const input = { requestId: randomUUID(), previewId: p.id };
		const ack = await categories.commitCategoryChange(actor, input);
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.definitions.find((v) => v.originId === first.originId)).toMatchObject({
			id: local.id,
			definitionVersionId: second.versionId
		});
		expect(state.decisions[0]).toEqual(manual);
		const reset = await preview(d.id, 'Reset');
		const changed = reset.differences.find((v) => v.kind === 'EntryChanged');
		expect(describeCategoryConsequence(changed?.before)).toBe('Artifacts (Manual)');
		expect(describeCategoryConsequence(changed?.after)).toBe('Reviewed artifacts (Automatic)');
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: reset.id });
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.decisions[0]).toMatchObject({
			state: 'Automatic',
			categoryId: local.id,
			definitionSnapshot: { id: second.versionId }
		});
		await decks.deleteDeck(actor, d.id);
		await database.pool.query(
			"UPDATE category_change_previews SET plan=NULL,expires_at=now()-interval '1 day' WHERE id=$1",
			[p.id]
		);
		expect(await categories.commitCategoryChange(actor, input)).toEqual(ack);
	});
	it('removes all hidden-role assignments atomically to Manual Uncategorized and suppresses future adoption until explicit restoration', async () => {
		const first = await save(),
			d = await deck(),
			c = await card();
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [
				{ op: 'add', card: c, role: 'main', quantity: 1 },
				{ op: 'add', card: c, role: 'sideboard', quantity: 1 }
			]
		});
		let state = await categories.getDeckEntryCategories(actor, d.id);
		const local = state.definitions.find((v) => v.originId === first.originId)!;
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[1].entryId,
			categoryId: local.id,
			expectedDecisionRevision: state.decisionRevision
		});
		state = await categories.getDeckEntryCategories(actor, d.id);
		const removal = {
			requestId: randomUUID(),
			deckId: d.id,
			categoryId: local.id,
			replacementCategoryId: null,
			expectedDecisionRevision: state.decisionRevision
		};
		const ack = await categories.removeLocalCategory(actor, removal);
		if (!('entryIds' in ack)) throw new Error('Expected entry acknowledgement');
		expect(ack.entryIds).toHaveLength(2);
		expect(await categories.removeLocalCategory(actor, removal)).toEqual(ack);
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.decisions.every((v) => v.state === 'Manual' && v.categoryId === null)).toBe(true);
		const p = await preview(d.id);
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id });
		expect(
			(await categories.getDeckEntryCategories(actor, d.id)).definitions.some(
				(v) => v.originId === first.originId
			)
		).toBe(false);
		const restored = await preview(d.id, 'Review', [first.originId]);
		expect(restored.differences.some((v) => v.kind === 'OriginRestored')).toBe(true);
		await categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: restored.id
		});
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.definitions.some((v) => v.originId === first.originId)).toBe(true);
		expect(state.decisions.every((v) => v.state === 'Manual' && v.categoryId === null)).toBe(true);
	});
	it('blocks distinct-origin name collisions with retained archived Manual categories until explicit local rename', async () => {
		const first = await save(),
			d = await deck(),
			c = await card();
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card: c, role: 'main', quantity: 1 }]
		});
		let state = await categories.getDeckEntryCategories(actor, d.id);
		const local = state.definitions.find((v) => v.originId === first.originId)!;
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[0].entryId,
			categoryId: local.id,
			expectedDecisionRevision: state.decisionRevision
		});
		await categories.archiveDefinition(actor, {
			requestId: randomUUID(),
			originId: first.originId,
			expectedLibraryRevision: first.libraryRevision,
			archived: true
		});
		await save();
		const blocked = await preview(d.id);
		expect(blocked.status).toBe('BlockedByNameConflict');
		await expect(
			categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: blocked.id })
		).rejects.toMatchObject({ kind: 'RequestConflict' });
		state = await categories.getDeckEntryCategories(actor, d.id);
		await categories.renameLocalCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			categoryId: local.id,
			name: 'Historical manual artifacts',
			expectedDecisionRevision: state.decisionRevision
		});
		const fresh = await preview(d.id);
		expect(fresh.status).toBe('Ready');
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: fresh.id });
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.definitions.find((v) => v.id === local.id)).toMatchObject({
			name: 'Historical manual artifacts',
			automaticEligible: false
		});
	});
	it('retains four original leases, rejects the fifth, does not renew expired identities and fences later Library changes', async () => {
		const d = await deck(),
			intent = {
				requestId: randomUUID(),
				deckId: d.id,
				scope: 'entry' as const,
				mode: 'Review' as const,
				restoreOriginIds: []
			};
		const p = await categories.previewCategoryChange(actor, intent);
		expect(await categories.previewCategoryChange(actor, intent)).toEqual(p);
		await Promise.all([preview(d.id), preview(d.id), preview(d.id)]);
		await expect(preview(d.id)).rejects.toMatchObject({ kind: 'CategoryPreviewCapacity' });
		await database.pool.query(
			"UPDATE category_change_previews SET expires_at=now()-interval '1 second' WHERE id=$1",
			[p.id]
		);
		const expired = await categories.previewCategoryChange(actor, intent);
		expect(expired.id).toBe(p.id);
		expect(expired.status).toBe('Expired');
		await expect(
			categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id })
		).rejects.toMatchObject({ kind: 'CategoryPreviewExpired' });
		await database.pool.query(
			"UPDATE category_change_previews SET expires_at=now()-interval '1 second' WHERE account_id=$1",
			[actor.accountId]
		);
		const fresh = await preview(d.id);
		await save();
		await expect(
			categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: fresh.id })
		).rejects.toMatchObject({ kind: 'RequestConflict' });
	});
	it('rechecks expiry after waiting on the account lock', async () => {
		const d = await deck(),
			p = await preview(d.id),
			lock = await database.pool.connect();
		await lock.query('BEGIN');
		await lock.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			actor.accountId
		]);
		const pending = categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: p.id
		});
		try {
			await lock.query(
				"UPDATE category_change_previews SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
				[p.id]
			);
			await lock.query('COMMIT');
			await expect(pending).rejects.toMatchObject({ kind: 'CategoryPreviewExpired' });
		} finally {
			await lock.query('ROLLBACK');
			lock.release();
		}
	});
	it('reviews an empty whole-deck bundle with a scoped no-op acknowledgement and replayable receipt', async () => {
		const d = await deck(),
			beforeEntry = await categories.getDeckEntryCategories(actor, d.id),
			beforeWhole = await categories.getDeckWholeCategories(actor, d.id);
		const intent = {
			requestId: randomUUID(),
			deckId: d.id,
			scope: 'deck' as const,
			mode: 'Review' as const,
			restoreOriginIds: []
		};
		const p = await categories.previewCategoryChange(actor, intent);
		expect(p).toMatchObject({ scope: 'deck', status: 'Ready', total: 0, differences: [] });
		expect(await categories.previewCategoryChange(actor, intent)).toEqual(p);
		const requestId = randomUUID();
		const committed = await categories.commitCategoryChange(actor, {
			requestId,
			previewId: p.id
		});
		if (!('scope' in committed)) throw new Error('Expected whole-deck acknowledgement');
		const acknowledgement: WholeCategoryAcknowledgement = committed;
		expect(acknowledgement).toEqual({
			requestId,
			deckId: d.id,
			scope: 'deck',
			decisionRevision: beforeWhole.decisionRevision,
			versionIds: [],
			changed: false
		});
		expect(await categories.getDeckEntryCategories(actor, d.id)).toEqual(beforeEntry);
		expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(beforeWhole);
		expect(
			(
				await database.pool.query(
					'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
					[actor.accountId, requestId]
				)
			).rows[0].acknowledgement
		).toEqual(acknowledgement);
		expect(await categories.commitCategoryChange(actor, { requestId, previewId: p.id })).toEqual(
			acknowledgement
		);
		expect(await categories.getCategoryPreview(actor, { previewId: p.id })).toMatchObject({
			status: 'Committed',
			acknowledgement
		});
	});
	it('Review retains hidden-role Manual choices but entry Reset releases them without changing roles or initializing other hidden entries', async () => {
		const first = await save(),
			d = await deck(),
			c = await card();
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [
				{ op: 'add', card: c, role: 'sideboard', quantity: 2 },
				{ op: 'add', card: c, role: 'commander', quantity: 1 }
			]
		});
		let state = await categories.getDeckEntryCategories(actor, d.id);
		const local = state.definitions.find((v) => v.originId === first.originId)!;
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[0].entryId,
			categoryId: local.id,
			expectedDecisionRevision: state.decisionRevision
		});
		const p = await preview(d.id);
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id });
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.decisions[0].state).toBe('Manual');
		const reset = await preview(d.id, 'Reset');
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: reset.id });
		state = await categories.getDeckEntryCategories(actor, d.id);
		expect(state.decisions).toHaveLength(1);
		expect(state.decisions[0]).toMatchObject({
			entryId: added.changes[0].entryId,
			state: 'Automatic',
			categoryId: local.id
		});
		const cards = await decks.getDeckCardsForDeck(actor, d.id);
		expect(cards.map((c) => [c.role, c.quantity]).sort()).toEqual([
			['commander', 1],
			['sideboard', 2]
		]);
	});
	it('locks the owned Deck before waiting on the preview row', async () => {
		const d = await deck(),
			p = await preview(d.id),
			hold = await database.pool.connect();
		await hold.query('BEGIN');
		await hold.query('SELECT id FROM category_change_previews WHERE id=$1 FOR UPDATE', [p.id]);
		const pending = categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: p.id
		});
		let ready = false;
		try {
			for (let attempt = 0; attempt < 100; attempt++) {
				const row = await database.pool.query(
					"SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND strpos(query,'category_change_previews')>0"
				);
				if (row.rows.length) {
					ready = true;
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(ready).toBe(true);
			const probe = await database.pool.connect();
			try {
				await probe.query('BEGIN');
				await expect(
					probe.query('SELECT id FROM decks WHERE id=$1 FOR UPDATE NOWAIT', [d.id])
				).rejects.toMatchObject({ code: '55P03' });
			} finally {
				await probe.query('ROLLBACK');
				probe.release();
			}
		} finally {
			await hold.query('COMMIT');
			hold.release();
			await pending;
		}
	});
	it('bounds blocked locks without a later preview or receipt', async () => {
		const d = await deck(),
			requestId = randomUUID(),
			hold = await database.pool.connect();
		await hold.query('BEGIN');
		await hold.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			actor.accountId
		]);
		const started = performance.now();
		try {
			await expect(
				categories.previewCategoryChange(actor, {
					requestId,
					deckId: d.id,
					scope: 'entry',
					mode: 'Review',
					restoreOriginIds: []
				})
			).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(performance.now() - started).toBeLessThan(4000);
		} finally {
			await hold.query('ROLLBACK');
			hold.release();
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(
			(
				await database.pool.query(
					'SELECT id FROM category_change_previews WHERE account_id=$1 AND request_id=$2',
					[actor.accountId, requestId]
				)
			).rows
		).toEqual([]);
	});
	it('reads relational pages and applies every consequence beyond the first page', async () => {
		const d = await deck();
		await database.pool.query(
			`INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role)
		SELECT gen_random_uuid(),$1,$2,'mtg',p.id::text,p.oracle_id::text,p.name,p.set_code,COALESCE(p.document->>'image_uri',''),1,'main'
		FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id WHERE p.lang='en' ORDER BY p.id LIMIT 150`,
			[d.id, actor.accountId]
		);
		const started = performance.now(),
			p = await preview(d.id);
		expect(p.total).toBeGreaterThanOrEqual(150);
		expect(p.differences).toHaveLength(50);
		const second = await categories.getCategoryPreview(actor, {
			previewId: p.id,
			offset: 50,
			limit: 100
		});
		expect(second.differences).toHaveLength(100);
		expect(new Set([...p.differences, ...second.differences].map((v) => v.entityId)).size).toBe(
			150
		);
		const storage = (
			await database.pool.query(
				"SELECT plan ? 'differences' AS duplicated,octet_length(plan::text) AS bytes FROM category_change_previews WHERE id=$1",
				[p.id]
			)
		).rows[0];
		expect(storage.duplicated).toBe(false);
		const ack = await categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: p.id
		});
		if (!('entryIds' in ack)) throw new Error('Expected entry acknowledgement');
		expect(ack.entryIds).toHaveLength(150);
		expect((await categories.getDeckEntryCategories(actor, d.id)).decisions).toHaveLength(150);
		console.info('category-150-complete-plan', {
			elapsedMs: Math.round(performance.now() - started),
			planBytes: storage.bytes,
			pageRows: second.differences.length,
			pageBytes: Buffer.byteLength(JSON.stringify(second))
		});
	});
	it('rolls back the complete plan when actual SQL fails before acknowledgement', async () => {
		const first = await save(),
			d = await deck(),
			c = await card();
		await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card: c, role: 'main', quantity: 1 }]
		});
		await save('New artifact label', { originId: first.originId, revision: first.libraryRevision });
		const before = await categories.getDeckEntryCategories(actor, d.id),
			p = await preview(d.id),
			requestId = randomUUID();
		await database.pool.query(
			`CREATE FUNCTION category16_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${p.id}'::uuid AND NEW.acknowledgement IS NOT NULL THEN RAISE EXCEPTION 'category16 fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER category16_fail_commit BEFORE UPDATE ON category_change_previews FOR EACH ROW EXECUTE FUNCTION category16_fail_commit()`
		);
		try {
			await expect(
				categories.commitCategoryChange(actor, { requestId, previewId: p.id })
			).rejects.toThrow();
		} finally {
			await database.pool.query(
				'DROP TRIGGER category16_fail_commit ON category_change_previews; DROP FUNCTION category16_fail_commit()'
			);
		}
		expect(await categories.getDeckEntryCategories(actor, d.id)).toEqual(before);
		expect(
			(
				await database.pool.query(
					'SELECT * FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
					[actor.accountId, requestId]
				)
			).rows
		).toEqual([]);
		expect((await categories.getCategoryPreview(actor, { previewId: p.id })).status).toBe('Ready');
	});
	it('measures a complete 1000-entry Deck and 500-definition Library without a membership cap', async () => {
		const d = await deck();
		const versions = Array.from({ length: 500 }, (_, index) => ({
			id: randomUUID(),
			originId: randomUUID(),
			scope: 'entry',
			version: 1,
			name: `Measured ${index}`,
			meaning: 'Known card types',
			priority: index,
			displayOrder: index,
			roles: ['main'],
			rule: {
				op: 'any',
				children: [
					{ op: 'type', value: 'Creature' },
					{ op: 'not', child: { op: 'type', value: 'Creature' } }
				]
			},
			createdAt: new Date().toISOString()
		}));
		await database.pool.query(
			`INSERT INTO category_definition_origins(id,account_id,scope,current_version,normalized_name) SELECT (v->>'originId')::uuid,$1,'entry',1,lower(v->>'name') FROM jsonb_array_elements($2::jsonb) v`,
			[actor.accountId, JSON.stringify(versions)]
		);
		await database.pool.query(
			`INSERT INTO category_definition_versions(id,origin_id,version,definition) SELECT (v->>'id')::uuid,(v->>'originId')::uuid,1,v FROM jsonb_array_elements($1::jsonb) v`,
			[JSON.stringify(versions)]
		);
		await database.pool.query(
			'INSERT INTO category_library_state(account_id,revision) VALUES($1,1)',
			[actor.accountId]
		);
		await database.pool.query(
			`INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role)
		SELECT gen_random_uuid(),$1,$2,'mtg',p.id::text,p.oracle_id::text,p.name,p.set_code,COALESCE(p.document->>'image_uri',''),1,'main' FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE p.lang='en' AND f.types IS NOT NULL AND f.raw_oracle_id IS NOT NULL ORDER BY p.id LIMIT 1000`,
			[d.id, actor.accountId]
		);
		const started = performance.now(),
			p = await preview(d.id),
			built = performance.now();
		expect(p.total).toBe(1500);
		const pageStart = performance.now(),
			last = await categories.getCategoryPreview(actor, {
				previewId: p.id,
				offset: 1400,
				limit: 100
			}),
			pageEnd = performance.now();
		expect(last.differences).toHaveLength(100);
		expect(last.differences.every((v) => v.kind === 'EntryChanged')).toBe(true);
		for (const row of last.differences) {
			expect(describeCategoryConsequence(row.before)).toBe('Unassigned');
			expect(describeCategoryConsequence(row.after)).toBe('Measured 0 (Automatic)');
		}
		const storage = (
			await database.pool.query(
				'SELECT octet_length(plan::text) AS bytes FROM category_change_previews WHERE id=$1',
				[p.id]
			)
		).rows[0];
		const queryPlan = (
			await database.pool.query(
				'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT difference FROM category_preview_differences WHERE preview_id=$1 AND position>=1400 ORDER BY position LIMIT 100',
				[p.id]
			)
		).rows[0]['QUERY PLAN'];
		const sources = (
			await database.pool.query(
				'SELECT cs.active_generation::text,os.active_publication::text FROM catalog_state cs CROSS JOIN oracle_tag_state os WHERE cs.id=1 AND os.id=1'
			)
		).rows[0];
		const commitStarted = performance.now();
		const committed = await categories.commitCategoryChange(actor, {
				requestId: randomUUID(),
				previewId: p.id
			}),
			ended = performance.now();
		if (!('entryIds' in committed)) throw new Error('Expected entry acknowledgement');
		expect(committed.entryIds).toHaveLength(1000);
		await writeFile(
			'/tmp/spellbook-slice16-many-plan-measurement-20261007.json',
			JSON.stringify(
				{
					nodeVersion: process.version,
					cpuCount: cpus().length,
					memoryGiB: Math.round(totalmem() / 1024 ** 3),
					sources,
					queryPlan,
					deckEntries: 1000,
					definitions: 500,
					consequences: p.total,
					previewMs: Math.round(built - started),
					deepPageMs: Math.round(pageEnd - pageStart),
					commitMs: Math.round(ended - commitStarted),
					planBytes: storage.bytes,
					pageBytes: Buffer.byteLength(JSON.stringify(last)),
					pageRows: 100
				},
				null,
				2
			)
		);
	}, 20000);
	it('cleans expired plan storage in progressing finite batches while keeping identity, expiry and committed replay', async () => {
		const d = await deck(),
			first = await preview(d.id),
			commitRequest = { requestId: randomUUID(), previewId: first.id },
			ack = await categories.commitCategoryChange(actor, commitRequest);
		await database.pool.query(
			`INSERT INTO category_change_previews(id,account_id,request_id,request_hash,deck_id,scope,mode,expires_at,plan,difference_total,blocked)
		SELECT gen_random_uuid(),account_id,gen_random_uuid(),'cleanup-fixture',deck_id,scope,mode,now()-interval '1 day',plan,100,false FROM category_change_previews p CROSS JOIN generate_series(1,25) WHERE p.id=$1`,
			[first.id]
		);
		await database.pool.query(
			`INSERT INTO category_preview_differences(preview_id,position,difference) SELECT p.id,n,'{"kind":"OriginRestored","entityId":"15ca0000-0000-4000-8000-000000000001","message":"retention fixture"}'::jsonb FROM category_change_previews p CROSS JOIN generate_series(0,99) n WHERE p.account_id=$1 AND request_hash='cleanup-fixture'`,
			[actor.accountId]
		);
		await database.pool.query(
			"UPDATE category_change_previews SET expires_at=now()-interval '1 day' WHERE id=$1",
			[first.id]
		);
		let remaining = 2500;
		for (let index = 0; index < 5; index++) {
			const fresh = await preview(d.id);
			const count = Number(
				(
					await database.pool.query(
						'SELECT count(*) AS total FROM category_preview_differences d JOIN category_change_previews p ON p.id=d.preview_id WHERE p.account_id=$1 AND p.request_hash=$2',
						[actor.accountId, 'cleanup-fixture']
					)
				).rows[0].total
			);
			expect(remaining - count).toBeLessThanOrEqual(1000);
			expect(count).toBeLessThanOrEqual(remaining);
			remaining = count;
			await database.pool.query(
				"UPDATE category_change_previews SET expires_at=now()-interval '1 day' WHERE id=$1",
				[fresh.id]
			);
		}
		expect(remaining).toBe(0);
		expect(
			(
				await database.pool.query(
					"SELECT count(*) AS total FROM category_change_previews WHERE account_id=$1 AND request_hash='cleanup-fixture'",
					[actor.accountId]
				)
			).rows[0].total
		).toBe('25');
		expect((await categories.getCategoryPreview(actor, { previewId: first.id })).status).toBe(
			'Committed'
		);
		await decks.deleteDeck(actor, d.id);
		expect(await categories.commitCategoryChange(actor, commitRequest)).toEqual(ack);
	});
	it('fences composition, decisions and changed public source tokens without changing source identity or dates', async () => {
		const d = await deck(),
			c = await card(),
			p = await preview(d.id);
		await decks.bulkMutateDeckCards(actor, {
			deckId: d.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card: c, role: 'main', quantity: 1 }]
		});
		await expect(
			categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id })
		).rejects.toMatchObject({ kind: 'RequestConflict' });
		const fresh = await preview(d.id),
			before = await categories.getDeckEntryCategories(actor, d.id),
			generation = (
				await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
			).rows[0].active_generation;
		try {
			await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			await expect(
				categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: fresh.id })
			).rejects.toMatchObject({ kind: 'RequestConflict' });
		} finally {
			await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
		}
		expect(await categories.getDeckEntryCategories(actor, d.id)).toEqual(before);
	});
	for (const role of ['sideboard', 'commander', 'companion'] as const)
		for (const choice of ['category', 'uncategorized'] as const) {
			it(`releases ${role} Manual ${choice} only on Reset and preserves its released decision when moved to Main`, async () => {
				const first = await save(),
					d = await deck(),
					c = await card();
				const added = await decks.bulkMutateDeckCards(actor, {
					deckId: d.id,
					requestId: randomUUID(),
					source: 'web',
					game: 'mtg',
					operations: [{ op: 'add', card: c, role, quantity: 1 }]
				});
				let state = await categories.getDeckEntryCategories(actor, d.id);
				const local = state.definitions.find((v) => v.originId === first.originId)!,
					entryId = added.changes[0].entryId;
				await categories.setEntryCategory(actor, {
					requestId: randomUUID(),
					deckId: d.id,
					entryId,
					categoryId: choice === 'category' ? local.id : null,
					expectedDecisionRevision: state.decisionRevision
				});
				const manual = (await categories.getDeckEntryCategories(actor, d.id)).decisions[0],
					review = await preview(d.id);
				expect(
					review.differences.some((v) => v.kind === 'EntryPreserved' && v.entityId === entryId)
				).toBe(true);
				await categories.commitCategoryChange(actor, {
					requestId: randomUUID(),
					previewId: review.id
				});
				expect((await categories.getDeckEntryCategories(actor, d.id)).decisions[0]).toEqual(manual);
				const reset = await preview(d.id, 'Reset');
				await categories.commitCategoryChange(actor, {
					requestId: randomUUID(),
					previewId: reset.id
				});
				state = await categories.getDeckEntryCategories(actor, d.id);
				const released = state.decisions[0];
				expect(released.state).toBe('Automatic');
				await decks.bulkMutateDeckCards(actor, {
					deckId: d.id,
					requestId: randomUUID(),
					source: 'web',
					game: 'mtg',
					operations: [{ op: 'move', target: { entryId }, role: 'main' }]
				});
				expect((await categories.getDeckEntryCategories(actor, d.id)).decisions[0]).toEqual(
					released
				);
			});
		}
});
