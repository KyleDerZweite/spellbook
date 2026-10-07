import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks,
	createCategories
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { starterDefinitions } from '@spellbook/backend/categories/rules.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('primary category decisions through authorized applications', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		decks: ReturnType<typeof createDecks>,
		categories: ReturnType<typeof createCategories>,
		actor: AuthUser,
		card: Awaited<ReturnType<typeof ensureDeckCatalogFixture>>;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		decks = createDecks(database.db, createCatalog(database.pool), auth);
		categories = createCategories(database.db, auth);
		card = await ensureDeckCatalogFixture(database.pool);
		const account = await auth.authenticate(
			'register',
			'categories_' + randomUUID().slice(0, 8),
			'category-integration-password'
		);
		if (!account) throw Error('Fixture registration');
		actor = account.user;
	});
	afterAll(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	it('retains explicit Manual Uncategorized across quantity/import additions and replay', async () => {
		const deck = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Categories',
			description: '',
			format: 'Modern'
		});
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card, quantity: 1, role: 'main' }]
		});
		const entryId = added.changes[0].entryId;
		const initial = await categories.getDeckEntryCategories(actor, deck.id);
		expect(initial.definitions).toHaveLength(8);
		expect(['Automatic', 'Pending']).toContain(initial.decisions[0].state);
		const input = {
			deckId: deck.id,
			entryId,
			categoryId: null,
			expectedDecisionRevision: initial.decisionRevision,
			requestId: randomUUID()
		};
		const ack = await categories.setEntryCategory(actor, input);
		await decks.bulkMutateDeckCards(actor, {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'import',
			game: 'mtg',
			operations: [{ op: 'add', card, quantity: 2, role: 'main' }]
		});
		expect(await categories.setEntryCategory(actor, input)).toEqual(ack);
		const latest = await categories.getDeckEntryCategories(actor, deck.id);
		expect(latest.decisions[0]).toMatchObject({ state: 'Manual', categoryId: null });
		expect((await decks.getDeckCardsForDeck(actor, deck.id))[0].quantity).toBe(3);
		await expect(
			categories.setEntryCategory(actor, { ...input, requestId: randomUUID() })
		).rejects.toMatchObject({ kind: 'CategoryConflict' });
	});
	it('requires a current consequence preview and retains complete destination Manual Uncategorized on merge', async () => {
		const deck = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Merge',
			description: '',
			format: 'Modern'
		});
		const added = await decks.bulkMutateDeckCards(actor, {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [
				{ op: 'add', card, quantity: 2, role: 'main' },
				{ op: 'add', card, quantity: 3, role: 'sideboard' }
			]
		});
		const mainId = added.changes[0].entryId,
			sideId = added.changes[1].entryId;
		let state = await categories.getDeckEntryCategories(actor, deck.id);
		await categories.setEntryCategory(actor, {
			deckId: deck.id,
			entryId: sideId,
			categoryId: null,
			expectedDecisionRevision: state.decisionRevision,
			requestId: randomUUID()
		});
		const op = { op: 'move' as const, target: { entryId: mainId }, role: 'sideboard' as const };
		await expect(
			decks.bulkMutateDeckCards(actor, {
				deckId: deck.id,
				requestId: randomUUID(),
				source: 'web',
				game: 'mtg',
				operations: [op]
			})
		).rejects.toMatchObject({ kind: 'CategoryMergeConflict' });
		const preview = await categories.previewEntryMerge(actor, {
			deckId: deck.id,
			entryId: mainId,
			catalogCardId: card.catalogCardId,
			role: 'sideboard',
			quantity: 2
		});
		expect(preview).toMatchObject({
			required: true,
			resultingQuantity: 5,
			destination: { entryId: sideId, state: 'Manual', categoryId: null }
		});
		await expect(
			decks.bulkMutateDeckCards(actor, {
				deckId: deck.id,
				requestId: randomUUID(),
				source: 'web',
				game: 'mtg',
				operations: [{ ...op, categoryPreview: 'null' }]
			})
		).rejects.toMatchObject({ kind: 'CategoryMergeConflict' });
		const beforeNoop = await categories.getDeckEntryCategories(actor, deck.id);
		const noopInput = {
			deckId: deck.id,
			entryId: sideId,
			categoryId: null,
			expectedDecisionRevision: beforeNoop.decisionRevision,
			requestId: randomUUID()
		};
		const noop = await categories.setEntryCategory(actor, noopInput);
		expect(noop).toMatchObject({ entryIds: [], decisionRevision: beforeNoop.decisionRevision });
		expect(await categories.getDeckEntryCategories(actor, deck.id)).toEqual(beforeNoop);
		expect(await categories.setEntryCategory(actor, noopInput)).toEqual(noop);
		const input = {
			deckId: deck.id,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ ...op, categoryPreview: preview.token }]
		};
		const ack = await decks.bulkMutateDeckCards(actor, input);
		expect(ack.removedEntryIds).toEqual([mainId]);
		state = await categories.getDeckEntryCategories(actor, deck.id);
		expect(state.decisions).toHaveLength(1);
		expect(state.decisions[0]).toMatchObject({
			entryId: sideId,
			state: 'Manual',
			categoryId: null
		});
		expect((await decks.getDeckCardsForDeck(actor, deck.id))[0].quantity).toBe(5);
		expect(await decks.bulkMutateDeckCards(actor, input)).toEqual(ack);
	});
	it('keeps existing-deck reads pure and initializes only through the authorized idempotent command', async () => {
		const deckId = randomUUID();
		await database.pool.query(
			"INSERT INTO decks(id,account_id,game,name,format) VALUES($1,$2,'mtg','Legacy','Modern')",
			[deckId, actor.accountId]
		);
		expect((await categories.getDeckEntryCategories(actor, deckId)).initialized).toBe(false);
		await decks.getDeckSnapshot(actor, 'mtg', deckId);
		expect((await categories.getDeckEntryCategories(actor, deckId)).initialized).toBe(false);
		const input = { deckId, requestId: randomUUID() };
		const [a, b] = await Promise.all([
			categories.initializeDeckCategories(actor, input),
			categories.initializeDeckCategories(actor, input)
		]);
		expect(a).toEqual(b);
		const state = await categories.getDeckEntryCategories(actor, deckId);
		expect(state.initialized).toBe(true);
		expect(state.definitions).toHaveLength(8);
		expect(
			await categories.initializeDeckCategories(actor, { deckId, requestId: randomUUID() })
		).toMatchObject({ decisionRevision: state.decisionRevision, entryIds: [] });
		await expect(categories.getDeckEntryCategories(actor, randomUUID())).rejects.toMatchObject({
			kind: 'NotFound'
		});
		const foreign = await auth.authenticate(
			'register',
			'foreign_' + randomUUID().slice(0, 8),
			'category-integration-password'
		);
		if (!foreign) throw Error('Foreign fixture registration');
		try {
			await expect(
				categories.initializeDeckCategories(foreign.user, { deckId, requestId: randomUUID() })
			).rejects.toMatchObject({ kind: 'NotFound' });
		} finally {
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [
				foreign.user.accountId
			]);
		}
	});
	it('classifies proven raw source facts once, preserves evidence after pruning, and treats missing canonical provenance as Unknown', async () => {
		const generation = (
			await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0].active_generation;
		const schema = (
			await database.pool.query('SELECT schema_version FROM catalog_generations WHERE id=$1', [
				generation
			])
		).rows[0].schema_version;
		const original = (
			await database.pool.query(
				'SELECT active_publication,previous_publication,refresh_status FROM oracle_tag_state WHERE id=1'
			)
		).rows[0];
		const originalFact = (
			await database.pool.query(
				'SELECT raw_oracle_id,types,transform_version FROM catalog_oracle_facts WHERE generation_id=$1 AND printing_id=$2',
				[generation, card.catalogCardId]
			)
		).rows[0];
		const publication = randomUUID();
		await database.pool.query(
			"INSERT INTO oracle_tag_publications(id,descriptor,source_updated_at,payload_digest,parser_version,mapping_version,mapping) VALUES($1,'{}','2026-10-06','fixture-digest',1,1,'{}')",
			[publication]
		);
		const roots = starterDefinitions.flatMap((d) => (d.rootId ? [d.rootId] : []));
		for (const root of roots) {
			await database.pool.query(
				'INSERT INTO oracle_tags(publication_id,id,label) VALUES($1,$2,$3)',
				[publication, root, 'mutable source label']
			);
			await database.pool.query('INSERT INTO oracle_tag_closure VALUES($1,$2,$2)', [
				publication,
				root
			]);
		}
		await database.pool.query(
			'UPDATE oracle_tag_state SET active_publication=$1,previous_publication=NULL,refresh_status=$2 WHERE id=1',
			[publication, { kind: 'Succeeded' }]
		);
		await database.pool.query('UPDATE catalog_generations SET schema_version=2 WHERE id=$1', [
			generation
		]);
		await database.pool.query(
			"INSERT INTO catalog_oracle_facts VALUES($1,$2,$3,ARRAY['Artifact'],2) ON CONFLICT(generation_id,printing_id) DO UPDATE SET raw_oracle_id=excluded.raw_oracle_id,types=excluded.types,transform_version=2",
			[generation, card.catalogCardId, card.canonicalCardId]
		);
		const ramp = starterDefinitions.find((d) => d.origin === 'ramp')!.rootId;
		const draw = starterDefinitions.find((d) => d.origin === 'draw')!.rootId;
		for (const root of [ramp, draw])
			await database.pool.query("INSERT INTO oracle_tag_memberships VALUES($1,$2,$3,'low')", [
				publication,
				root,
				card.canonicalCardId
			]);
		const make = async () => {
			const deck = await decks.createDeckRecord(actor, {
				game: 'mtg',
				name: 'Facts',
				description: '',
				format: 'Modern'
			});
			await decks.addCatalogCardToDeck(actor, {
				deckId: deck.id,
				catalogCardId: card.catalogCardId,
				quantity: 1,
				role: 'main',
				requestId: randomUUID()
			});
			return deck;
		};
		try {
			const deck = await make();
			let state = await categories.getDeckEntryCategories(actor, deck.id);
			const saved = state.decisions[0];
			expect(state.definitions.find((d) => d.id === saved.categoryId)?.origin).toBe('ramp');
			expect(saved.evidence).toMatchObject({
				oraclePublicationId: publication,
				payloadDigest: 'fixture-digest',
				rawOracleId: card.canonicalCardId
			});
			await database.pool.query(
				'UPDATE catalog_oracle_facts SET raw_oracle_id=NULL WHERE generation_id=$1 AND printing_id=$2',
				[generation, card.catalogCardId]
			);
			const unknown = await make();
			expect((await categories.getDeckEntryCategories(actor, unknown.id)).decisions[0].state).toBe(
				'Pending'
			);
			await database.pool.query(
				'UPDATE catalog_oracle_facts SET raw_oracle_id=$3 WHERE generation_id=$1 AND printing_id=$2',
				[generation, card.catalogCardId, card.catalogCardId]
			);
			const equal = await make();
			state = await categories.getDeckEntryCategories(actor, equal.id);
			expect(state.decisions[0]).toMatchObject({ state: 'Automatic', categoryId: null });
			await database.pool.query('UPDATE oracle_tag_state SET active_publication=NULL WHERE id=1');
			await database.pool.query('DELETE FROM oracle_tag_publications WHERE id=$1', [publication]);
			expect((await categories.getDeckEntryCategories(actor, deck.id)).decisions[0]).toEqual(saved);
			expect((await categories.getDeckEntryCategories(actor, deck.id)).definitions).toHaveLength(8);
			const missing = await make();
			expect((await categories.getDeckEntryCategories(actor, missing.id)).decisions[0].state).toBe(
				'Pending'
			);
		} finally {
			await database.pool.query(
				'UPDATE oracle_tag_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
				[original.active_publication, original.previous_publication, original.refresh_status]
			);
			await database.pool.query('DELETE FROM oracle_tag_publications WHERE id=$1', [publication]);
			if (originalFact) {
				await database.pool.query(
					'UPDATE catalog_oracle_facts SET raw_oracle_id=$3,types=$4,transform_version=$5 WHERE generation_id=$1 AND printing_id=$2',
					[
						generation,
						card.catalogCardId,
						originalFact.raw_oracle_id,
						originalFact.types,
						originalFact.transform_version
					]
				);
			} else {
				await database.pool.query(
					'DELETE FROM catalog_oracle_facts WHERE generation_id=$1 AND printing_id=$2',
					[generation, card.catalogCardId]
				);
			}
			await database.pool.query('UPDATE catalog_generations SET schema_version=$2 WHERE id=$1', [
				generation,
				schema
			]);
		}
	});
	it('preserves complete hidden decisions through non-merging role and printing changes', async () => {
		const deck = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Preservation',
			description: '',
			format: 'Modern'
		});
		const added = await decks.addCatalogCardToDeck(actor, {
			deckId: deck.id,
			catalogCardId: card.catalogCardId,
			quantity: 2,
			role: 'main',
			requestId: randomUUID()
		});
		const entryId = added.changes[0].entryId;
		let state = await categories.getDeckEntryCategories(actor, deck.id);
		await categories.setEntryCategory(actor, {
			deckId: deck.id,
			entryId,
			categoryId: null,
			expectedDecisionRevision: state.decisionRevision,
			requestId: randomUUID()
		});
		state = await categories.getDeckEntryCategories(actor, deck.id);
		const saved = state.decisions[0];
		await decks.updateDeckCard(actor, entryId, 2, 'sideboard', randomUUID());
		expect((await categories.getDeckEntryCategories(actor, deck.id)).decisions[0]).toEqual(saved);
		const printing = (
			await createCatalog(database.pool).getPrintings(card.canonicalCardId)
		).hits.find((d) => d.id !== card.catalogCardId);
		expect(printing).toBeDefined();
		await decks.changeDeckPrinting(actor, {
			entryId,
			catalogCardId: printing!.id,
			quantity: 2,
			role: 'main',
			requestId: randomUUID()
		});
		expect((await categories.getDeckEntryCategories(actor, deck.id)).decisions[0]).toEqual(saved);
		expect((await decks.getDeckCardsForDeck(actor, deck.id))[0]).toMatchObject({
			id: entryId,
			catalogCardId: printing!.id,
			role: 'main'
		});
	});
	it('notifies only committed category changes including empty initialization and preserves original replay', async () => {
		const listener = await database.pool.connect();
		const events: Array<{ accountId: string; topic: string }> = [];
		listener.on('notification', ({ payload }) => {
			if (payload) {
				const event = JSON.parse(payload);
				if (event.accountId === actor.accountId) events.push(event);
			}
		});
		const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
		const notified = async () => {
			const until = Date.now() + 2000;
			while (!events.length && Date.now() < until) await settle();
			expect(events).toEqual([{ accountId: actor.accountId, topic: 'decks' }]);
			events.length = 0;
		};
		const unchanged = async () => {
			await settle();
			expect(events).toEqual([]);
		};
		const failedId = randomUUID();
		const faultName = 'category_commit_fault_' + failedId.replaceAll('-', '');
		let faultCreated = false;
		try {
			await listener.query('LISTEN spellbook_saved_state');
			const deck = await decks.createDeckRecord(actor, {
				game: 'mtg',
				name: 'Signal contract',
				description: '',
				format: 'Modern'
			});
			await notified();
			// A pre-category empty Deck has no adopted bundle; current creation initializes it.
			await database.pool.query('DELETE FROM deck_category_bundles WHERE deck_id=$1', [deck.id]);
			expect((await categories.getDeckEntryCategories(actor, deck.id)).initialized).toBe(false);
			const initialization = { deckId: deck.id, requestId: randomUUID() };
			const initialAck = await categories.initializeDeckCategories(actor, initialization);
			expect(initialAck.entryIds).toEqual([]);
			await notified();
			expect(await categories.initializeDeckCategories(actor, initialization)).toEqual(initialAck);
			await unchanged();
			await categories.initializeDeckCategories(actor, {
				...initialization,
				requestId: randomUUID()
			});
			await unchanged();
			const added = await decks.bulkMutateDeckCards(actor, {
				deckId: deck.id,
				requestId: randomUUID(),
				source: 'web',
				game: 'mtg',
				operations: [{ op: 'add', card, quantity: 1, role: 'main' }]
			});
			await notified();
			const entryId = added.changes[0].entryId;
			const beforeDeck = (
				await database.pool.query(
					'SELECT updated_at,composition_revision,description_revision FROM decks WHERE id=$1',
					[deck.id]
				)
			).rows[0];
			const initial = await categories.getDeckEntryCategories(actor, deck.id);
			const input = {
				deckId: deck.id,
				entryId,
				categoryId: null,
				expectedDecisionRevision: initial.decisionRevision,
				requestId: randomUUID()
			};
			const ack = await categories.setEntryCategory(actor, input);
			await notified();
			expect(
				(
					await database.pool.query(
						'SELECT updated_at,composition_revision,description_revision FROM decks WHERE id=$1',
						[deck.id]
					)
				).rows[0]
			).toEqual(beforeDeck);
			expect(await categories.setEntryCategory(actor, input)).toEqual(ack);
			await unchanged();
			const current = await categories.getDeckEntryCategories(actor, deck.id);
			const noOp = await categories.setEntryCategory(actor, {
				...input,
				expectedDecisionRevision: current.decisionRevision,
				requestId: randomUUID()
			});
			expect(noOp.entryIds).toEqual([]);
			await unchanged();
			await database.pool.query(
				`CREATE FUNCTION ${faultName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-owned deferred category commit failure'; END $$`
			);
			await database.pool.query(
				`CREATE CONSTRAINT TRIGGER ${faultName} AFTER INSERT ON category_mutation_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.request_id='${failedId}'::uuid) EXECUTE FUNCTION ${faultName}()`
			);
			faultCreated = true;
			await expect(
				categories.setEntryCategory(actor, {
					...input,
					requestId: failedId,
					categoryId: current.definitions[0].id,
					expectedDecisionRevision: current.decisionRevision
				})
			).rejects.toMatchObject({
				cause: { message: 'test-owned deferred category commit failure' }
			});
			await unchanged();
			expect(await categories.getDeckEntryCategories(actor, deck.id)).toEqual(current);
			expect(
				(
					await database.pool.query(
						'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
						[actor.accountId, failedId]
					)
				).rowCount
			).toBe(0);
			await decks.deleteDeck(actor, deck.id);
			await notified();
			expect(await categories.setEntryCategory(actor, input)).toEqual(ack);
			await unchanged();
		} finally {
			if (faultCreated)
				await database.pool.query(`DROP TRIGGER ${faultName} ON category_mutation_requests`);
			await database.pool.query(`DROP FUNCTION IF EXISTS ${faultName}()`);
			await listener.query('UNLISTEN spellbook_saved_state');
			listener.release();
		}
	});
});
