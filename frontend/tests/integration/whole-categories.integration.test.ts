import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@spellbook/backend/db/schema.ts';
import { readFile } from 'node:fs/promises';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks,
	createCategories
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { DeckRule, SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';
import type { DeckOperation } from '@spellbook/contracts/decks.ts';
import {
	claimWholeDeckJob,
	processWholeDeckJob,
	backoffWholeDeckJob
} from '@spellbook/backend/categories/jobs.ts';
import { evaluateWholeDeck } from '@spellbook/backend/categories/whole.ts';
import { publishCategoryCatalogFixture } from '../fixtures/category-catalog.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('whole Categories persistence, durable jobs and bounded directory', () => {
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
		const session = await auth.authenticate(
			'register',
			'whole_' + randomUUID().slice(0, 8),
			'whole-category-integration-password'
		);
		if (!session) throw new Error('Registration failed');
		actor = session.user;
	});
	afterEach(async () => {
		if (actor)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
	});
	afterAll(async () => {
		try {
			await restoreCatalog?.();
		} finally {
			await database.pool.end();
		}
	});
	const creature: DeckRule = {
		op: 'minimumCopies',
		minimum: 1,
		predicate: { op: 'type', value: 'Creature' }
	};
	async function save(name: string, rule: DeckRule = creature, originId: string | null = null) {
		const input: SaveDefinitionInput = {
			requestId: randomUUID(),
			originId,
			expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
			scope: 'deck',
			name,
			meaning: name + ' meaning',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			rule,
			confirmRetainedRule: true
		};
		return categories.saveDefinition(actor, input);
	}
	const deck = (name = 'Whole fixture') =>
		decks.createDeckRecord(actor, { game: 'mtg', name, format: 'Modern', description: '' });
	async function card() {
		const row = (
			await database.pool.query(
				"SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE p.lang='en' AND f.raw_oracle_id IS NOT NULL AND 'Creature'=ANY(f.types) ORDER BY p.id LIMIT 1"
			)
		).rows[0];
		if (!row) throw new Error('Recorded Creature missing');
		const d = row.document;
		return {
			catalogCardId: d.id,
			canonicalCardId: d.oracle_id,
			name: d.name,
			setCode: d.set_code,
			imageUri: d.image_uri
		};
	}
	const mutate = (deckId: string, operations: DeckOperation[], requestId = randomUUID()) =>
		decks.bulkMutateDeckCards(actor, { deckId, operations, requestId, source: 'web', game: 'mtg' });
	const preview = (
		deckId: string,
		mode: 'Review' | 'Reset' = 'Review',
		restoreOriginIds: string[] = []
	) =>
		categories.previewCategoryChange(actor, {
			requestId: randomUUID(),
			deckId,
			scope: 'deck',
			mode,
			restoreOriginIds
		});
	async function claim(deckId: string) {
		await database.pool.query(
			"UPDATE deck_whole_category_jobs SET available_at=clock_timestamp()-interval '1 day' WHERE deck_id=$1",
			[deckId]
		);
		const result = await claimWholeDeckJob(database.db);
		expect(result?.deckId).toBe(deckId);
		if (!result) throw new Error('Owned claim missing');
		return result;
	}
	const processJob = async (deckId: string) =>
		processWholeDeckJob(database.db, await claim(deckId), evaluateWholeDeck);
	const job = async (deckId: string) =>
		(
			await database.pool.query(
				'SELECT generation::text,composition_revision::text,decision_revision::text,lease_token::text,attempts,last_error,available_at FROM deck_whole_category_jobs WHERE deck_id=$1',
				[deckId]
			)
		).rows[0];
	const revision = async () => (await decks.getDeckLibrary(actor)).revision;
	async function manual(deckId: string, versionId: string, choice: 'Include' | 'Exclude') {
		return categories.setWholeCategory(actor, {
			requestId: randomUUID(),
			deckId,
			versionId,
			manual: choice,
			expectedDecisionRevision: (await categories.getDeckWholeCategories(actor, deckId))
				.decisionRevision
		});
	}

	it('evaluates initial empty negated rules and hydrates exact saved versions without consulting current Library definitions', async () => {
		const first = await save('No Creatures', { op: 'not', child: creature });
		const d = await deck();
		expect((await job(d.id)).generation).toBe('1');
		const second = await save('New Creature strategy', creature, first.originId);
		await database.pool.query('DELETE FROM deck_whole_categories WHERE deck_id=$1', [d.id]);
		// Execute the native migration's snapshot hydration against this owned legacy bundle.
		const migration = await readFile(
			new URL('../../drizzle/0022_whole_deck_categories.sql', import.meta.url),
			'utf8'
		);
		const hydration = migration
			.split('--> statement-breakpoint')
			.find((statement) => statement.trim().startsWith('INSERT INTO deck_whole_categories('));
		if (!hydration) throw new Error('Native whole snapshot hydration missing');
		await database.pool.query(
			hydration.replace(
				'FROM deck_category_bundles b',
				'FROM (SELECT * FROM deck_category_bundles WHERE deck_id=$1) b'
			),
			[d.id]
		);
		const adopted = await categories.getDeckWholeCategories(actor, d.id);
		expect(adopted.categories).toHaveLength(1);
		expect(adopted.categories[0]).toMatchObject({
			versionId: first.versionId,
			name: 'No Creatures',
			definition: { version: 1 }
		});
		expect(adopted.categories[0].versionId).not.toBe(second.versionId);
		await processJob(d.id);
		expect(
			(await categories.getDeckWholeCategories(actor, d.id)).categories[0].decision
		).toMatchObject({
			state: 'Automatic',
			truth: 'True',
			attemptedTruth: 'True',
			evidence: { definitionVersionId: first.versionId, compositionRevision: '0' }
		});
		expect(await job(d.id)).toBeUndefined();
	});

	it('coalesces semantic composition changes and ignores receipts, floor no-ops, description writes and source refresh', async () => {
		await save('Creatures');
		const d = await deck();
		const added = await mutate(d.id, [
			{ op: 'add', card: await card(), quantity: 1, role: 'main' }
		]);
		const target = { entryId: added.changes[0].entryId };
		const requestId = randomUUID();
		const operations: DeckOperation[] = [{ op: 'increment', target, quantity: 1 }];
		const result = await mutate(d.id, operations, requestId);
		const queued = await job(d.id);
		expect(queued.generation).toBe('3');
		expect(await mutate(d.id, operations, requestId)).toEqual(result);
		await mutate(d.id, [{ op: 'set', target, quantity: 2 }]);
		await decks.updateDeck(actor, {
			deckId: d.id,
			description: 'Only prose',
			descriptionRevision: d.descriptionRevision
		});
		expect(await job(d.id)).toEqual(queued);
		await processJob(d.id);
		expect(
			(await categories.getDeckWholeCategories(actor, d.id)).categories[0].decision?.truth
		).toBe('True');
		await decks.updateDeckCard(actor, target.entryId, undefined, undefined, randomUUID(), -100);
		await processJob(d.id);
		const floorRevision = await revision();
		await decks.updateDeckCard(actor, target.entryId, undefined, undefined, randomUUID(), -1);
		expect(await job(d.id)).toBeUndefined();
		expect(await revision()).toBe(floorRevision);
		const state = await categories.getDeckWholeCategories(actor, d.id);
		const source = (
			await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0].active_generation;
		try {
			await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(state);
			expect(await job(d.id)).toBeUndefined();
		} finally {
			await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				source
			]);
		}
		await manual(d.id, state.categories[0].versionId, 'Include');
		expect(await job(d.id)).toBeUndefined();
	});

	it('claims once across competing workers, recovers expired leases and fences stale success and error', async () => {
		await save('Creatures');
		const d = await deck();
		await database.pool.query(
			"UPDATE deck_whole_category_jobs SET available_at=clock_timestamp()-interval '1 day' WHERE deck_id=$1",
			[d.id]
		);
		const claims = await Promise.all([
			claimWholeDeckJob(database.db),
			claimWholeDeckJob(database.db)
		]);
		expect(claims.filter(Boolean)).toHaveLength(1);
		const original = claims.find((value) => value !== null)!;
		await database.pool.query(
			"UPDATE deck_whole_category_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE deck_id=$1",
			[d.id]
		);
		const recovered = await claim(d.id);
		expect(recovered.leaseToken).not.toBe(original.leaseToken);
		expect(recovered.attempts).toBe(2);
		const evaluate = vi.fn(evaluateWholeDeck);
		await processWholeDeckJob(database.db, original, evaluate);
		expect(evaluate).not.toHaveBeenCalled();
		await mutate(d.id, [{ op: 'add', card: await card(), quantity: 2, role: 'main' }]);
		const newer = await job(d.id);
		await processWholeDeckJob(database.db, recovered, evaluate);
		await backoffWholeDeckJob(database.db, recovered);
		expect(evaluate).not.toHaveBeenCalled();
		expect(await job(d.id)).toEqual(newer);
		const latest = await claim(d.id);
		await expect(
			processWholeDeckJob(database.db, latest, async () => {
				throw new Error('Owned evaluator infrastructure fault');
			})
		).rejects.toThrow('Owned evaluator infrastructure fault');
		await backoffWholeDeckJob(database.db, latest);
		expect(await job(d.id)).toMatchObject({
			generation: newer.generation,
			lease_token: null,
			attempts: 1,
			last_error: 'Category evaluation temporarily unavailable'
		});
		await processJob(d.id);
		expect(await job(d.id)).toBeUndefined();
	});

	it('rolls back evaluated changes when cancellation arrives before publication', async () => {
		await save('Creatures');
		const d = await deck();
		await mutate(d.id, [{ op: 'add', card: await card(), quantity: 1, role: 'main' }]);
		const claimed = await claim(d.id);
		const before = await categories.getDeckWholeCategories(actor, d.id);
		const directoryRevision = await revision();
		const controller = new AbortController();
		await expect(
			processWholeDeckJob(
				database.db,
				claimed,
				async (tx, deckId, compositionRevision) => {
					const result = await evaluateWholeDeck(tx, deckId, compositionRevision);
					controller.abort();
					return result;
				},
				controller.signal
			)
		).rejects.toThrow();
		expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(before);
		expect(await revision()).toBe(directoryRevision);
		expect((await job(d.id)).lease_token).toBe(claimed.leaseToken);
		await database.pool.query(
			"UPDATE deck_whole_category_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE deck_id=$1",
			[d.id]
		);
		await processJob(d.id);
		expect(
			(await categories.getDeckWholeCategories(actor, d.id)).categories[0].decision?.truth
		).toBe('True');
	});

	it('publishes only committed visible changes and enforces account ownership', async () => {
		const first = await save('Creatures');
		const d = await deck();
		await processJob(d.id);
		const listener = await database.pool.connect();
		const events: unknown[] = [];
		listener.on('notification', ({ payload }) => {
			if (payload) {
				const event = JSON.parse(payload);
				if (event.accountId === actor.accountId) events.push(event);
			}
		});
		const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
		let outsider: AuthUser | undefined;
		try {
			await listener.query('LISTEN spellbook_saved_state');
			const input = {
				requestId: randomUUID(),
				deckId: d.id,
				versionId: first.versionId,
				manual: 'Include' as const,
				expectedDecisionRevision: (await categories.getDeckWholeCategories(actor, d.id))
					.decisionRevision
			};
			const ack = await categories.setWholeCategory(actor, input);
			await settle();
			expect(events.splice(0)).toEqual([{ accountId: actor.accountId, topic: 'decks' }]);
			await categories.setWholeCategory(actor, input);
			await categories.setWholeCategory(actor, {
				...input,
				requestId: randomUUID(),
				expectedDecisionRevision: ack.decisionRevision
			});
			await categories.getDeckWholeCategories(actor, d.id);
			await decks.getDeckLibrary(actor);
			const p = await preview(d.id);
			expect(
				await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id })
			).toMatchObject({ scope: 'deck', changed: false });
			await settle();
			expect(events).toEqual([]);
			const account = await auth.authenticate(
				'register',
				'whole_other_' + randomUUID().slice(0, 8),
				'whole-category-integration-password'
			);
			if (!account) throw new Error('Outsider registration failed');
			outsider = account.user;
			expect((await decks.getDeckLibrary(outsider)).globalTotal).toBe(0);
			expect((await decks.getDeckLibraryCategories(outsider)).items).toEqual([]);
			await expect(categories.getDeckWholeCategories(outsider, d.id)).rejects.toMatchObject({
				kind: 'NotFound'
			});
			await expect(
				categories.setWholeCategory(outsider, {
					...input,
					requestId: randomUUID(),
					expectedDecisionRevision: ack.decisionRevision
				})
			).rejects.toMatchObject({ kind: 'NotFound' });
			await expect(
				categories.getCategoryPreview(outsider, { previewId: p.id })
			).rejects.toMatchObject({ kind: 'NotFound' });
		} finally {
			await listener.query('UNLISTEN spellbook_saved_state');
			listener.release();
			if (outsider)
				await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [
					outsider.accountId
				]);
		}
	});

	it('preserves historical Manual meaning on Review and resets only whole choices while retaining entry Manual decisions', async () => {
		const first = await save('Draw strategy');
		const d = await deck();
		const added = await mutate(d.id, [
			{ op: 'add', card: await card(), quantity: 1, role: 'main' }
		]);
		const entryState = await categories.getDeckEntryCategories(actor, d.id);
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[0].entryId,
			categoryId: null,
			expectedDecisionRevision: entryState.decisionRevision
		});
		const entryManual = (await categories.getDeckEntryCategories(actor, d.id)).decisions;
		await manual(d.id, first.versionId, 'Include');
		const second = await save(
			'Infinite Counter strategy',
			{ op: 'comboOutcome', outcomeId: '42', policyVersion: 'ingredients-v1' },
			first.originId
		);
		const p = await preview(d.id);
		expect(p.status).toBe('Ready');
		expect(
			p.differences.some(
				(difference) =>
					difference.kind === 'RetainedManual' && difference.entityId === first.versionId
			)
		).toBe(true);
		const commit = { requestId: randomUUID(), previewId: p.id };
		const ack = await categories.commitCategoryChange(actor, commit);
		expect(ack).toMatchObject({ scope: 'deck', changed: true });
		expect(await categories.commitCategoryChange(actor, commit)).toEqual(ack);
		const state = await categories.getDeckWholeCategories(actor, d.id);
		expect(state.categories.find((c) => c.versionId === first.versionId)).toMatchObject({
			automaticActive: false,
			name: 'Draw strategy',
			decision: { state: 'Manual', manual: 'Include' }
		});
		expect(state.categories.find((c) => c.versionId === second.versionId)).toMatchObject({
			automaticActive: true,
			decision: { state: 'Pending', truth: null, attemptedTruth: 'Unknown' }
		});
		expect(
			(await decks.getDeckLibrary(actor, { categoryVersionIds: [first.versionId] })).matchingTotal
		).toBe(1);
		expect(
			(await decks.getDeckLibrary(actor, { categoryVersionIds: [second.versionId] })).matchingTotal
		).toBe(0);
		const choices = await decks.getDeckLibraryCategories(actor, {
			selectedVersionIds: [first.versionId, second.versionId],
			limit: 1
		});
		expect(choices.selected.find((c) => c.versionId === first.versionId)).toMatchObject({
			historical: true,
			name: 'Draw strategy',
			count: 1
		});
		const reset = await preview(d.id, 'Reset');
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: reset.id });
		expect(
			(await categories.getDeckWholeCategories(actor, d.id)).categories.map((c) => c.versionId)
		).toEqual([second.versionId]);
		expect((await categories.getDeckEntryCategories(actor, d.id)).decisions).toEqual(entryManual);
	});

	it('commits exactly displayed results and rejects Library, composition, decision and source changes', async () => {
		const first = await save('No Creatures', { op: 'not', child: creature });
		const d = await deck();
		const p = await preview(d.id);
		const shown = p.differences.find((difference) => difference.kind === 'DeckChanged')?.after;
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id });
		expect((await categories.getDeckWholeCategories(actor, d.id)).categories[0]).toEqual(shown);
		for (const fence of ['library', 'composition', 'decision', 'source'] as const) {
			const fresh = await preview(d.id);
			const generation = (
				await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
			).rows[0].active_generation;
			try {
				if (fence === 'library') await save('Other definition');
				if (fence === 'composition')
					await mutate(d.id, [{ op: 'add', card: await card(), quantity: 1, role: 'main' }]);
				if (fence === 'decision') await manual(d.id, first.versionId, 'Exclude');
				if (fence === 'source')
					await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
				const before = await categories.getDeckWholeCategories(actor, d.id);
				const requestId = randomUUID();
				await expect(
					categories.commitCategoryChange(actor, { requestId, previewId: fresh.id })
				).rejects.toMatchObject({ kind: 'RequestConflict' });
				expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(before);
				expect(
					(
						await database.pool.query(
							'SELECT 1 FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
							[actor.accountId, requestId]
						)
					).rows
				).toEqual([]);
			} finally {
				if (fence === 'source')
					await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
						generation
					]);
			}
		}
	});

	it('keeps GET read-only, mutation receipts exact and local suppression explicit', async () => {
		const first = await save('Creatures');
		const d = await deck();
		await processJob(d.id);
		const before = await categories.getDeckWholeCategories(actor, d.id);
		const directoryRevision = await revision();
		for (let i = 0; i < 3; i++) {
			expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(before);
			await decks.getDeckLibrary(actor);
			await decks.getDeckLibraryCategories(actor);
			await decks.locateDeck(actor, d.id);
			await decks.getDeck(actor, d.id);
		}
		expect(await revision()).toBe(directoryRevision);
		expect(await job(d.id)).toBeUndefined();
		const input = {
			requestId: randomUUID(),
			deckId: d.id,
			versionId: first.versionId,
			manual: 'Include' as const,
			expectedDecisionRevision: before.decisionRevision
		};
		const ack = await categories.setWholeCategory(actor, input);
		expect(await categories.setWholeCategory(actor, input)).toEqual(ack);
		await expect(
			categories.setWholeCategory(actor, { ...input, manual: 'Exclude' })
		).rejects.toMatchObject({ kind: 'ValidationFailed' });
		const after = await revision();
		expect(
			(
				await categories.setWholeCategory(actor, {
					...input,
					requestId: randomUUID(),
					expectedDecisionRevision: ack.decisionRevision
				})
			).changed
		).toBe(false);
		expect(await revision()).toBe(after);
		await categories.renameWholeCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			versionId: first.versionId,
			name: 'Local strategy',
			expectedDecisionRevision: ack.decisionRevision
		});
		const state = await categories.getDeckWholeCategories(actor, d.id);
		await categories.removeWholeCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			versionId: first.versionId,
			expectedDecisionRevision: state.decisionRevision
		});
		const review = await preview(d.id);
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: review.id });
		expect(
			(await decks.getDeckLibrary(actor, { categoryVersionIds: [first.versionId] })).matchingTotal
		).toBe(0);
		const restore = await preview(d.id, 'Review', [first.originId]);
		await categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: restore.id
		});
		expect(
			(await decks.getDeckLibrary(actor, { categoryVersionIds: [first.versionId] })).matchingTotal
		).toBe(1);
	});

	it('retains valid automatic membership visibly Pending after unknown source facts and completes that attempt without retry', async () => {
		const first = await save('Creatures');
		const d = await deck();
		const added = await mutate(d.id, [
			{ op: 'add', card: await card(), quantity: 1, role: 'main' }
		]);
		await processJob(d.id);
		const valid = (await categories.getDeckWholeCategories(actor, d.id)).categories[0].decision;
		const generation = (
			await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0].active_generation;
		try {
			await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			await mutate(d.id, [
				{ op: 'increment', target: { entryId: added.changes[0].entryId }, quantity: 1 }
			]);
			await processJob(d.id);
			const pending = (await categories.getDeckWholeCategories(actor, d.id)).categories[0].decision;
			expect(pending).toMatchObject({
				state: 'Pending',
				truth: 'True',
				attemptedTruth: 'Unknown',
				evidence: valid?.evidence,
				previousEvaluation: { attemptedTruth: 'Unknown' }
			});
			expect(
				(await decks.getDeckLibrary(actor, { categoryVersionIds: [first.versionId] })).matchingTotal
			).toBe(1);
			expect(await job(d.id)).toBeUndefined();
		} finally {
			await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
		}
	});

	it('keeps unchanged Review a no-op with origin order opposite display order', async () => {
		const definitions = [await save('Later alphabet'), await save('Earlier alphabet')];
		const ordered = definitions.slice().sort((a, b) => a.originId.localeCompare(b.originId));
		for (let index = 0; index < ordered.length; index++) {
			const definition = (await categories.getDefinition(actor, ordered[index].originId)).current;
			await categories.saveDefinition(actor, {
				requestId: randomUUID(),
				originId: definition.originId,
				expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
				scope: 'deck',
				name: definition.name,
				meaning: definition.meaning,
				priority: definition.priority,
				displayOrder: ordered.length - index,
				roles: definition.roles,
				rule: definition.rule,
				confirmRetainedRule: true
			});
		}
		const d = await deck();
		await processJob(d.id);
		const before = await categories.getDeckWholeCategories(actor, d.id);
		const directoryRevision = await revision();
		const p = await preview(d.id);
		expect(p.differences).toEqual([]);
		const ack = await categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: p.id
		});
		expect(ack).toMatchObject({
			scope: 'deck',
			changed: false,
			decisionRevision: before.decisionRevision
		});
		expect(await categories.getDeckWholeCategories(actor, d.id)).toEqual(before);
		expect(await revision()).toBe(directoryRevision);
		expect(await job(d.id)).toBeUndefined();
	});

	it('Reset keeps prior valid truth when facts become Unknown and releases Manual decisions, including suppressed versions', async () => {
		const first = await save('Creatures');
		const d = await deck();
		const added = await mutate(d.id, [
			{ op: 'add', card: await card(), quantity: 1, role: 'main' }
		]);
		await processJob(d.id);
		let state = await categories.getDeckWholeCategories(actor, d.id);
		const evidence = state.categories[0].decision!.evidence;
		const entryState = await categories.getDeckEntryCategories(actor, d.id);
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: added.changes[0].entryId,
			categoryId: null,
			expectedDecisionRevision: entryState.decisionRevision
		});
		const entryManual = (await categories.getDeckEntryCategories(actor, d.id)).decisions;
		const generation = (
			await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0].active_generation;
		try {
			await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			for (const manualChoice of [null, 'Include', 'Exclude'] as const) {
				if (manualChoice) await manual(d.id, first.versionId, manualChoice);
				const p = await preview(d.id, 'Reset');
				await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id });
				state = await categories.getDeckWholeCategories(actor, d.id);
				expect(state.categories[0].decision).toMatchObject({
					state: 'Pending',
					manual: null,
					truth: 'True',
					attemptedTruth: 'Unknown',
					evidence,
					previousEvaluation: { attemptedTruth: 'Unknown' }
				});
			}
		} finally {
			await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				generation
			]);
		}
		await manual(d.id, first.versionId, 'Include');
		state = await categories.getDeckWholeCategories(actor, d.id);
		await categories.removeWholeCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			versionId: first.versionId,
			expectedDecisionRevision: state.decisionRevision
		});
		const reset = await preview(d.id, 'Reset');
		await categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: reset.id });
		state = await categories.getDeckWholeCategories(actor, d.id);
		expect(state.categories[0]).toMatchObject({ suppressed: true, decision: { manual: null } });
		expect(state.categories[0].decision?.state).not.toBe('Manual');
		const restore = await preview(d.id, 'Review', [first.originId]);
		await categories.commitCategoryChange(actor, {
			requestId: randomUUID(),
			previewId: restore.id
		});
		state = await categories.getDeckWholeCategories(actor, d.id);
		expect(state.categories[0]).toMatchObject({
			suppressed: false,
			decision: { state: 'Automatic', manual: null, truth: 'True' }
		});
		expect((await categories.getDeckEntryCategories(actor, d.id)).decisions).toEqual(entryManual);
	});

	it('bounds metadata across more than 1000 real Deck rows, overlaps, exact counts, deep location and selected Deck outside filters', async () => {
		const captured: { query: string; params: unknown[] }[] = [];
		const observed = createDecks(
			drizzle(database.pool, {
				schema,
				logger: {
					logQuery(query, params) {
						captured.push({ query, params });
					}
				}
			}),
			createCatalog(database.pool),
			auth
		);
		const definitions = [];
		for (let i = 0; i < 5; i++) definitions.push(await save('Overlapping ' + i));
		const template = await deck('Scale 0000');
		await mutate(template.id, [{ op: 'add', card: await card(), quantity: 2, role: 'main' }]);
		await processJob(template.id);
		// Relational scale fixtures copy real persisted adoption and genuine Catalog printings.
		await database.pool.query(
			"INSERT INTO decks(id,account_id,game,name,description,format) SELECT gen_random_uuid(),$1,'mtg','Scale '||lpad(n::text,4,'0'),'','Modern' FROM generate_series(1,1004) n",
			[actor.accountId]
		);
		await database.pool.query(
			'INSERT INTO deck_category_bundles(deck_id,definitions,whole_deck_definitions,library_revision,decision_revision) SELECT d.id,b.definitions,b.whole_deck_definitions,b.library_revision,b.decision_revision FROM decks d CROSS JOIN deck_category_bundles b WHERE d.account_id=$1 AND d.id<>$2 AND b.deck_id=$2',
			[actor.accountId, template.id]
		);
		await database.pool.query(
			'INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) SELECT gen_random_uuid(),d.id,d.account_id,e.game,e.catalog_card_id,e.canonical_card_id,e.name,e.set_code,e.image_uri,e.quantity,e.role FROM decks d CROSS JOIN deck_cards e WHERE d.account_id=$1 AND d.id<>$2 AND e.deck_id=$2',
			[actor.accountId, template.id]
		);
		await database.pool.query(
			'INSERT INTO deck_whole_categories(deck_id,version_id,origin_id,definition_snapshot,name,display_order,suppressed,automatic_active) SELECT d.id,c.version_id,c.origin_id,c.definition_snapshot,c.name,c.display_order,c.suppressed,c.automatic_active FROM decks d CROSS JOIN deck_whole_categories c WHERE d.account_id=$1 AND d.id<>$2 AND c.deck_id=$2',
			[actor.accountId, template.id]
		);
		await database.pool.query(
			'INSERT INTO deck_whole_category_decisions(deck_id,version_id,state,manual,truth,attempted_truth,revision,evidence,previous_evaluation) SELECT d.id,w.version_id,w.state,w.manual,w.truth,w.attempted_truth,w.revision,w.evidence,w.previous_evaluation FROM decks d CROSS JOIN deck_whole_category_decisions w WHERE d.account_id=$1 AND d.id<>$2 AND w.deck_id=$2',
			[actor.accountId, template.id]
		);
		// Bulk fixtures need current statistics before inspecting the application's actual plans.
		await database.pool.query(
			'ANALYZE decks, deck_cards, deck_whole_categories, deck_whole_category_decisions, category_definition_origins, category_definition_versions'
		);
		const query = {
			sort: 'name:asc' as const,
			categoryVersionIds: definitions.slice(0, 2).map((definition) => definition.versionId),
			limit: 200
		};
		const page = await observed.getDeckLibrary(actor, query);
		const pageStatements = captured.splice(0);
		expect(page).toMatchObject({ globalTotal: 1005, matchingTotal: 1005, limit: 200 });
		expect(page.items).toHaveLength(200);
		expect(
			page.items.every(
				(item) =>
					item.quantity === 2 && item.categories.length === 3 && item.remainingCategoryCount === 2
			)
		).toBe(true);
		expect(JSON.stringify(page)).not.toContain('predicate');
		const options = await observed.getDeckLibraryCategories(actor, {
			...query,
			expectedRevision: page.revision
		});
		const optionStatements = captured.splice(0);
		expect(options.items).toHaveLength(5);
		expect(options.items.every((option) => option.count === 1005)).toBe(true);
		const deep = await observed.getDeckLibrary(actor, {
			...query,
			offset: 800,
			expectedRevision: page.revision
		});
		const deepStatements = captured.splice(0);
		expect(deep.items).toHaveLength(200);
		expect(deep.items[0].name).toBe('Scale 0800');
		const end = await observed.getDeckLibrary(actor, {
			...query,
			offset: 1000,
			expectedRevision: page.revision
		});
		const endStatements = captured.splice(0);
		expect(end.items).toHaveLength(5);
		expect(
			(
				await observed.locateDeck(actor, end.items[4].id, {
					...query,
					expectedRevision: page.revision
				})
			).offset
		).toBe(1004);
		const locationStatements = captured.splice(0);
		const outside = { ...query, query: 'no matching names' };
		expect((await decks.getDeckLibrary(actor, outside)).matchingTotal).toBe(0);
		expect((await decks.locateDeck(actor, template.id, outside)).offset).toBeNull();
		expect((await decks.getDeck(actor, template.id)).decks.map((d) => d.id)).toEqual([template.id]);
		await decks.updateDeck(actor, { deckId: template.id, name: 'Changed scale name' });
		for (const read of [
			() => decks.getDeckLibrary(actor, { ...query, expectedRevision: page.revision }),
			() => decks.getDeckLibraryCategories(actor, { ...query, expectedRevision: page.revision }),
			() => decks.locateDeck(actor, template.id, { ...query, expectedRevision: page.revision })
		])
			await expect(read()).rejects.toMatchObject({ kind: 'RevisionChanged' });
		const statement = (statements: typeof captured, pattern: string) => {
			const found = statements.find(({ query }) => query.includes(pattern));
			if (!found) throw new Error('Expected actual emitted directory SQL: ' + pattern);
			return found;
		};
		const actual = {
			page: statement(pageStatements, 'LEFT JOIN LATERAL'),
			deep: statement(deepStatements, 'LEFT JOIN LATERAL'),
			end: statement(endStatements, 'LEFT JOIN LATERAL'),
			options: statement(optionStatements, 'AS count FROM choices'),
			location: statement(locationStatements, 'WITH ranked AS')
		};
		const plans: Record<string, unknown> = {};
		for (const [kind, { query: emittedSQL, params }] of Object.entries(actual)) {
			const plan = (
				await database.pool.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + emittedSQL, params)
			).rows[0]['QUERY PLAN'];
			expect(plan[0].Plan['Actual Rows']).toBe(
				kind === 'page' || kind === 'deep' ? 200 : kind === 'options' || kind === 'end' ? 5 : 1
			);
			plans[kind] = { emittedSQL, params, plan };
		}
		console.info(
			'whole-deck-directory-1005',
			JSON.stringify({ rows: 1005, metadataBytes: Buffer.byteLength(JSON.stringify(page)), plans })
		);
	}, 20_000);
});
