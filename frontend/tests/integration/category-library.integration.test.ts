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
import type { SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('immutable actor-owned account Category Library', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		categories: ReturnType<typeof createCategories>,
		decks: ReturnType<typeof createDecks>,
		actor: AuthUser;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		categories = createCategories(database.db, auth);
		decks = createDecks(database.db, createCatalog(database.pool), auth);
		const account = await auth.authenticate(
			'register',
			'library16_' + randomUUID().slice(0, 8),
			'category-library-integration-password'
		);
		if (!account) throw Error('Registration');
		actor = account.user;
	});
	afterAll(async () => {
		if (actor)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	it('pure reads do not initialize account state; immutable versions affect new adoption only and original replay survives later edits', async () => {
		expect(await categories.getLibrary(actor)).toMatchObject({
			revision: '0',
			definitions: [],
			total: 0
		});
		expect(
			(
				await database.pool.query(
					'SELECT count(*) FROM category_library_state WHERE account_id=$1',
					[actor.accountId]
				)
			).rows[0].count
		).toBe('0');
		const input: SaveDefinitionInput = {
			requestId: randomUUID(),
			originId: null,
			expectedLibraryRevision: '0',
			scope: 'entry',
			name: ' Air ',
			meaning: 'Cards with Flying',
			priority: 0,
			displayOrder: 5,
			roles: ['main'],
			rule: { op: 'keyword', value: 'Flying' },
			confirmRetainedRule: false
		};
		const first = await categories.saveDefinition(actor, input);
		const a = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Old adopted Library',
			description: '',
			format: 'Modern'
		});
		expect(
			(await categories.getDeckEntryCategories(actor, a.id)).definitions.find(
				(d) => d.originId === first.originId
			)?.name
		).toBe('Air');
		const second = await categories.saveDefinition(actor, {
			...input,
			requestId: randomUUID(),
			originId: first.originId,
			expectedLibraryRevision: first.libraryRevision,
			name: 'Flying cards'
		});
		expect(await categories.saveDefinition(actor, input)).toEqual(first);
		const b = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Latest Library',
			description: '',
			format: 'Modern'
		});
		expect(
			(await categories.getDeckEntryCategories(actor, a.id)).definitions.find(
				(d) => d.originId === first.originId
			)?.definitionVersionId
		).toBe(first.versionId);
		expect(
			(await categories.getDeckEntryCategories(actor, b.id)).definitions.find(
				(d) => d.originId === first.originId
			)?.definitionVersionId
		).toBe(second.versionId);
		expect(
			(
				await database.pool.query(
					'SELECT count(*) FROM category_definition_versions WHERE origin_id=$1',
					[first.originId]
				)
			).rows[0].count
		).toBe('2');
		await expect(
			categories.saveDefinition(actor, { ...input, name: 'Changed payload' })
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		await expect(
			categories.saveDefinition(actor, {
				...input,
				requestId: randomUUID(),
				originId: first.originId,
				expectedLibraryRevision: second.libraryRevision,
				meaning: 'Changed meaning'
			})
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		const archived = await categories.archiveDefinition(actor, {
			originId: first.originId,
			requestId: randomUUID(),
			expectedLibraryRevision: second.libraryRevision,
			archived: true
		});
		const c = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Archived future adoption',
			description: '',
			format: 'Modern'
		});
		expect((await categories.getDeckEntryCategories(actor, c.id)).definitions).toHaveLength(8);
		expect((await categories.getDeckEntryCategories(actor, a.id)).definitions).toHaveLength(9);
		const whole = await categories.saveDefinition(actor, {
			...input,
			requestId: randomUUID(),
			expectedLibraryRevision: archived.libraryRevision,
			scope: 'deck',
			name: 'Air',
			rule: { op: 'minimumCopies', predicate: { op: 'keyword', value: 'Flying' }, minimum: 8 }
		});
		const d = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Separate whole-deck adoption',
			description: '',
			format: 'Modern'
		});
		const bundle = (
			await database.pool.query(
				'SELECT whole_deck_definitions,library_revision::text FROM deck_category_bundles WHERE deck_id=$1',
				[d.id]
			)
		).rows[0];
		expect(bundle.whole_deck_definitions).toHaveLength(1);
		expect(bundle.library_revision).toBe(whole.libraryRevision);
	});
	it('rejects an account custom name colliding with an independent starter during complete new-deck adoption', async () => {
		const input: SaveDefinitionInput = {
			requestId: randomUUID(),
			originId: null,
			expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
			scope: 'entry',
			name: ' Draw ',
			meaning: 'Independent custom Flying meaning',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			rule: { op: 'keyword', value: 'Flying' },
			confirmRetainedRule: false
		};
		await expect(categories.saveDefinition(actor, input)).rejects.toMatchObject({
			kind: 'ValidationFailed'
		});
		const originId = randomUUID(),
			versionId = randomUUID(),
			version = {
				...input,
				id: versionId,
				originId,
				version: 1,
				name: 'Draw',
				createdAt: new Date().toISOString()
			};
		await database.pool.query(
			'INSERT INTO category_library_state(account_id,revision) VALUES($1,1) ON CONFLICT(account_id) DO UPDATE SET revision=category_library_state.revision+1',
			[actor.accountId]
		);
		await database.pool.query(
			"INSERT INTO category_definition_origins(id,account_id,scope,current_version,normalized_name) VALUES($1,$2,'entry',1,'draw')",
			[originId, actor.accountId]
		);
		await database.pool.query(
			'INSERT INTO category_definition_versions(id,origin_id,version,definition) VALUES($1,$2,1,$3::jsonb)',
			[versionId, originId, JSON.stringify(version)]
		);
		const count = () =>
			database.pool.query('SELECT count(*)::text AS count FROM decks WHERE account_id=$1', [
				actor.accountId
			]);
		const before = (await count()).rows[0].count;
		await expect(
			decks.createDeckRecord(actor, {
				game: 'mtg',
				name: 'Collision must not create deck',
				description: '',
				format: 'Modern'
			})
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		expect((await count()).rows[0].count).toBe(before);
		const fixed = await categories.saveDefinition(actor, {
			...input,
			originId,
			requestId: randomUUID(),
			expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
			name: 'Custom Flying'
		});
		const adopted = await decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Explicitly resolved starter collision',
			description: '',
			format: 'Modern'
		});
		const definitions = (await categories.getDeckEntryCategories(actor, adopted.id)).definitions;
		expect(
			definitions.some((d) => d.originId === fixed.originId && d.name === 'Custom Flying')
		).toBe(true);
		expect(definitions.filter((d) => d.name === 'Draw')).toHaveLength(1);
	});
	it('publishes shared Deck invalidation only for committed Library, local and reviewed semantic changes', async () => {
		const listener = await database.pool.connect(),
			events: unknown[] = [];
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
			expect(events.splice(0)).toEqual([{ accountId: actor.accountId, topic: 'decks' }]);
		};
		const silent = async () => {
			await settle();
			expect(events).toEqual([]);
		};
		const failure = randomUUID(),
			fault = 'category16_sync_' + failure.replaceAll('-', '');
		try {
			await listener.query('LISTEN spellbook_saved_state');
			const input: SaveDefinitionInput = {
				requestId: randomUUID(),
				originId: null,
				expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
				scope: 'entry',
				name: 'Signal definition',
				meaning: 'Creature rule',
				priority: 0,
				displayOrder: 0,
				roles: ['main'],
				rule: { op: 'type', value: 'Creature' },
				confirmRetainedRule: false
			};
			const first = await categories.saveDefinition(actor, input);
			await notified();
			expect(await categories.saveDefinition(actor, input)).toEqual(first);
			await silent();
			const noOp = await categories.saveDefinition(actor, {
				...input,
				requestId: randomUUID(),
				originId: first.originId,
				expectedLibraryRevision: first.libraryRevision
			});
			expect(noOp.changed).toBe(false);
			await silent();
			const deck = await decks.createDeckRecord(actor, {
				game: 'mtg',
				name: 'Category signal',
				description: '',
				format: 'Modern'
			});
			await notified();
			const local = (await categories.getDeckEntryCategories(actor, deck.id)).definitions.find(
				(d) => d.originId === first.originId
			)!;
			const rename = {
				requestId: randomUUID(),
				deckId: deck.id,
				categoryId: local.id,
				name: 'Local signal label',
				expectedDecisionRevision: (await categories.getDeckEntryCategories(actor, deck.id))
					.decisionRevision
			};
			const renamed = await categories.renameLocalCategory(actor, rename);
			await notified();
			expect(await categories.renameLocalCategory(actor, rename)).toEqual(renamed);
			await silent();
			await categories.renameLocalCategory(actor, {
				...rename,
				requestId: randomUUID(),
				expectedDecisionRevision: renamed.decisionRevision
			});
			await silent();
			const review = await categories.previewCategoryChange(actor, {
				requestId: randomUUID(),
				deckId: deck.id,
				scope: 'entry',
				mode: 'Review',
				restoreOriginIds: []
			});
			await silent();
			const commit = { requestId: randomUUID(), previewId: review.id };
			const reviewed = await categories.commitCategoryChange(actor, commit);
			await notified();
			expect(await categories.commitCategoryChange(actor, commit)).toEqual(reviewed);
			await silent();
			const noOpPreview = await categories.previewCategoryChange(actor, {
				requestId: randomUUID(),
				deckId: deck.id,
				scope: 'entry',
				mode: 'Review',
				restoreOriginIds: []
			});
			await categories.commitCategoryChange(actor, {
				requestId: randomUUID(),
				previewId: noOpPreview.id
			});
			await silent();
			const archive = {
				requestId: randomUUID(),
				originId: first.originId,
				archived: true,
				expectedLibraryRevision: (await categories.getLibrary(actor)).revision
			};
			const archived = await categories.archiveDefinition(actor, archive);
			await notified();
			expect(await categories.archiveDefinition(actor, archive)).toEqual(archived);
			await silent();
			expect(
				(
					await categories.archiveDefinition(actor, {
						...archive,
						requestId: randomUUID(),
						expectedLibraryRevision: archived.libraryRevision
					})
				).changed
			).toBe(false);
			await silent();
			const remove = {
				requestId: randomUUID(),
				deckId: deck.id,
				categoryId: local.id,
				replacementCategoryId: null,
				expectedDecisionRevision: (await categories.getDeckEntryCategories(actor, deck.id))
					.decisionRevision
			};
			const removed = await categories.removeLocalCategory(actor, remove);
			await notified();
			expect(await categories.removeLocalCategory(actor, remove)).toEqual(removed);
			await silent();
			const before = await categories.getLibrary(actor);
			await database.pool.query(
				`CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned Category Library commit fault'; END $$`
			);
			await database.pool.query(
				`CREATE CONSTRAINT TRIGGER ${fault} AFTER INSERT ON category_mutation_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.request_id='${failure}'::uuid) EXECUTE FUNCTION ${fault}()`
			);
			await expect(
				categories.saveDefinition(actor, {
					...input,
					requestId: failure,
					name: 'Rolled back signal',
					expectedLibraryRevision: before.revision
				})
			).rejects.toMatchObject({ cause: { message: 'owned Category Library commit fault' } });
			await silent();
			expect(await categories.getLibrary(actor)).toEqual(before);
		} finally {
			await database.pool.query(`DROP TRIGGER IF EXISTS ${fault} ON category_mutation_requests`);
			await database.pool.query(`DROP FUNCTION IF EXISTS ${fault}()`);
			await listener.query('UNLISTEN spellbook_saved_state');
			listener.release();
		}
	});
});
