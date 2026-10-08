import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks,
	createCategories
} from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	CategoryRole,
	CategoryScope,
	DeckRule,
	EntryRule
} from '@spellbook/contracts/category-library.ts';
import type { DeckOperation } from '@spellbook/contracts/decks.ts';
import { claimWholeDeckJob, processWholeDeckJob } from '@spellbook/backend/categories/jobs.ts';
import { readComboFacts, readComboSource } from '@spellbook/backend/categories/combo.ts';
import { categoryTransaction } from '@spellbook/backend/categories/work.ts';
import { configureComboAdapter } from '@spellbook/backend/categories/combo-settings.ts';
import { evaluateWholeDeck } from '@spellbook/backend/categories/whole.ts';
import {
	publishComboCatalogFixture,
	publishComboFixture,
	recordedOakVariant,
	oakOracleId,
	denizenOracleId
} from '../fixtures/combo.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const participant: EntryRule = {
	op: 'comboParticipant',
	outcomeId: '2244',
	policyVersion: 'ingredients-v1'
};
const outcome: DeckRule = {
	op: 'comboOutcome',
	outcomeId: '2244',
	policyVersion: 'ingredients-v1'
};
run('transaction-bound documented combo categories', () => {
	let database: ReturnType<typeof createDatabase>,
		auth: ReturnType<typeof createLocalAuth>,
		categories: ReturnType<typeof createCategories>,
		decks: ReturnType<typeof createDecks>,
		actor: AuthUser;
	let restoreCatalog: (() => Promise<void>) | undefined;
	let source: Awaited<ReturnType<typeof publishComboFixture>> | undefined;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!, { commanderSpellbookEnabled: true });
		restoreCatalog = await publishComboCatalogFixture(database.pool);
		auth = createLocalAuth(database.db, { demoMode: false });
		categories = createCategories(database.db, auth);
		decks = createDecks(database.db, createCatalog(database.pool), auth);
	}, 60_000);
	beforeEach(async () => {
		source = await publishComboFixture(database.pool);
		const session = await auth.authenticate(
			'register',
			'combo_' + randomUUID().slice(0, 8),
			'combo-integration-password'
		);
		if (!session) throw new Error('Fixture registration failed');
		actor = session.user;
	});
	afterEach(async () => {
		try {
			if (actor)
				await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [
					actor.accountId
				]);
		} finally {
			await source?.restore();
			source = undefined;
		}
	});
	afterAll(async () => {
		try {
			await restoreCatalog?.();
		} finally {
			await database.pool.end();
		}
	});
	async function save(
		scope: CategoryScope,
		name: string,
		rule: EntryRule | DeckRule,
		roles: CategoryRole[] = ['main', 'commander'],
		originId: string | null = null
	) {
		return categories.saveDefinition(actor, {
			requestId: randomUUID(),
			originId,
			expectedLibraryRevision: (await categories.getLibrary(actor)).revision,
			scope,
			name,
			meaning: name,
			priority: 0,
			displayOrder: 0,
			roles,
			rule,
			confirmRetainedRule: true
		});
	}
	const deck = () =>
		decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Recorded combo fixture',
			format: 'Commander',
			description: ''
		});
	async function card(oracleId: string) {
		const row = (
			await database.pool.query(
				'SELECT p.document FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id JOIN catalog_oracle_facts f ON f.generation_id=p.generation_id AND f.printing_id=p.id WHERE f.raw_oracle_id=$1',
				[oracleId]
			)
		).rows[0];
		if (!row) throw new Error('Recorded ingredient missing');
		const d = row.document;
		return {
			catalogCardId: d.id,
			canonicalCardId: d.oracle_id,
			name: d.name,
			setCode: d.set_code,
			imageUri: d.image_uri
		};
	}
	async function add(deckId: string, oracleId: string, role: CategoryRole = 'main', quantity = 1) {
		const ack = await decks.bulkMutateDeckCards(actor, {
			deckId,
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card: await card(oracleId), role, quantity }]
		});
		return ack.changes[0].entryId;
	}
	async function processJob(deckId: string) {
		await database.pool.query(
			"UPDATE deck_whole_category_jobs SET available_at=clock_timestamp()-interval '1 day' WHERE deck_id=$1",
			[deckId]
		);
		const job = await claimWholeDeckJob(database.db);
		expect(job?.deckId).toBe(deckId);
		if (!job) throw new Error('Owned job missing');
		await processWholeDeckJob(database.db, job, evaluateWholeDeck);
	}
	const preview = (deckId: string, scope: CategoryScope, mode: 'Review' | 'Reset' = 'Review') =>
		categories.previewCategoryChange(actor, {
			requestId: randomUUID(),
			deckId,
			scope,
			mode,
			restoreOriginIds: []
		});
	async function review(deckId: string, scope: CategoryScope, mode: 'Review' | 'Reset' = 'Review') {
		const p = await preview(deckId, scope, mode);
		expect(p.status).toBe('Ready');
		return categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id });
	}
	async function whole(deckId: string, versionId: string) {
		return (await categories.getDeckWholeCategories(actor, deckId)).categories.find(
			(c) => c.versionId === versionId
		)?.decision;
	}

	it.each([
		[oakOracleId, denizenOracleId],
		[denizenOracleId, oakOracleId]
	])(
		'classifies both insertion orders and keeps saved entry decisions until explicit Review: %s',
		async (first, second) => {
			const e = await save('entry', 'Documented participants', participant);
			const w = await save('deck', 'Documented ingredients', outcome);
			const d = await deck();
			const firstId = await add(d.id, first);
			await processJob(d.id);
			expect(await whole(d.id, w.versionId)).toMatchObject({
				truth: 'False',
				attemptedTruth: 'False'
			});
			const original = (await categories.getDeckEntryCategories(actor, d.id)).decisions.find(
				(v) => v.entryId === firstId
			);
			const secondId = await add(d.id, second);
			expect(
				(await categories.getDeckEntryCategories(actor, d.id)).decisions.find(
					(v) => v.entryId === firstId
				)
			).toEqual(original);
			const before = await categories.getDeckEntryCategories(actor, d.id);
			expect(before.decisions.find((v) => v.entryId === secondId)).toMatchObject({
				state: 'Automatic',
				categoryId: before.definitions.find((v) => v.definitionVersionId === e.versionId)?.id
			});
			await processJob(d.id);
			const positive = await whole(d.id, w.versionId);
			expect(positive).toMatchObject({
				truth: 'True',
				evidence: {
					combo: {
						evaluations: [
							{ proof: { variant: recordedOakVariant, publicationId: source!.publicationId } }
						]
					}
				}
			});
			await review(d.id, 'entry');
			const reviewed = await categories.getDeckEntryCategories(actor, d.id);
			expect(
				reviewed.decisions.every(
					(v) =>
						v.categoryId ===
						reviewed.definitions.find((c) => c.definitionVersionId === e.versionId)?.id
				)
			).toBe(true);
			// A refresh failure keeps the usable publication and does not enqueue a job or rewrite evidence.
			await database.pool.query(
				`UPDATE combo_state SET refresh_status='{"kind":"Failed","error":"RecordedFailure"}' WHERE id=1`
			);
			expect(await whole(d.id, w.versionId)).toEqual(positive);
			expect(
				(
					await database.pool.query('SELECT 1 FROM deck_whole_category_jobs WHERE deck_id=$1', [
						d.id
					])
				).rows
			).toEqual([]);
			await review(d.id, 'deck');
			expect(await whole(d.id, w.versionId)).toMatchObject({
				truth: 'True',
				evidence: {
					combo: { source: { availability: 'Available', refreshStatus: { kind: 'Failed' } } }
				}
			});
		}
	);

	it('uses the import application transaction with complete composition and excludes Sideboard ingredients', async () => {
		const e = await save('entry', 'Import participants', participant);
		const w = await save('deck', 'Import ingredients', outcome);
		const operations: DeckOperation[] = [
			{ op: 'add', card: await card(oakOracleId), role: 'main', quantity: 1 },
			{ op: 'add', card: await card(denizenOracleId), role: 'main', quantity: 1 }
		];
		const input = {
			requestId: randomUUID(),
			source: 'web',
			game: 'mtg',
			name: 'Recorded import',
			description: '',
			format: 'Commander',
			operations
		};
		const ack = await decks.importDeck(actor, input);
		expect(await decks.importDeck(actor, input)).toEqual(ack);
		const state = await categories.getDeckEntryCategories(actor, ack.deckId);
		expect(state.decisions).toHaveLength(2);
		expect(
			state.decisions.every(
				(v) =>
					v.state === 'Automatic' &&
					v.categoryId === state.definitions.find((c) => c.definitionVersionId === e.versionId)?.id
			)
		).toBe(true);
		await processJob(ack.deckId);
		expect(await whole(ack.deckId, w.versionId)).toMatchObject({ truth: 'True' });
		const excluded = await deck();
		await add(excluded.id, oakOracleId);
		await add(excluded.id, denizenOracleId, 'sideboard');
		await processJob(excluded.id);
		expect(await whole(excluded.id, w.versionId)).toMatchObject({ truth: 'False' });
	});

	it('preserves Entry role identity for same-printing Commander/Main A inside nested minimum and percentage predicates', async () => {
		// Synthetic policy case derived explicitly from the recorded ingredients, not provider evidence.
		await source!.restore();
		source = await publishComboFixture(database.pool, [
			{
				...recordedOakVariant,
				id: 'synthetic-commander-policy',
				ingredients: [
					{ ...recordedOakVariant.ingredients[0], mustBeCommander: true },
					recordedOakVariant.ingredients[1]
				]
			}
		]);
		const w = await save('deck', 'Commander ingredient', outcome);
		const minimum = await save('deck', 'Three participants', {
			op: 'all',
			children: [
				{
					op: 'minimumCopies',
					minimum: 3,
					predicate: { op: 'all', children: [participant, { op: 'type', value: 'Creature' }] }
				}
			]
		});
		const percentage = await save('deck', 'All participants', {
			op: 'percentage',
			basisPoints: 10000,
			denominator: 'all-cards',
			predicate: participant
		});
		const two = await save('deck', 'Two participants', {
			op: 'minimumCopies',
			minimum: 2,
			predicate: participant
		});
		const d = await deck();
		await add(d.id, oakOracleId, 'commander');
		const mainA = await add(d.id, oakOracleId);
		const mainB = await add(d.id, denizenOracleId);
		await processJob(d.id);
		expect(await whole(d.id, w.versionId)).toMatchObject({ truth: 'True' });
		expect(await whole(d.id, minimum.versionId)).toMatchObject({ truth: 'False' });
		expect(await whole(d.id, percentage.versionId)).toMatchObject({
			truth: 'False',
			evidence: { bounds: { lower: '2', upper: '2', denominatorLower: '3', denominatorUpper: '3' } }
		});
		expect(await whole(d.id, two.versionId)).toMatchObject({
			truth: 'True',
			evidence: { bounds: { lower: '2', upper: '2' } }
		});
		const e = await save('entry', 'Commander participants', participant);
		await review(d.id, 'entry');
		const entries = await categories.getDeckEntryCategories(actor, d.id);
		const id = entries.definitions.find((v) => v.definitionVersionId === e.versionId)?.id;
		expect(entries.decisions.find((v) => v.entryId === mainA)?.categoryId).not.toBe(id);
		expect(entries.decisions.find((v) => v.entryId === mainB)).toMatchObject({
			categoryId: id,
			state: 'Automatic'
		});
	});

	it('excludes Main from uncertain Commander-only requirements and nested aggregate upper bounds', async () => {
		await source!.restore();
		source = await publishComboFixture(database.pool, [
			{
				...recordedOakVariant,
				id: 'synthetic-unknown-commander-only',
				ingredients: [
					{ ...recordedOakVariant.ingredients[0], oracleId: null, mustBeCommander: true }
				],
				unsupportedReasons: ['oracle-id']
			}
		]);
		await save('entry', 'Uncertain commander participation', participant);
		const minimum = await save('deck', 'Two uncertain participants', {
			op: 'minimumCopies',
			minimum: 2,
			predicate: participant
		});
		const percentage = await save('deck', 'All uncertain participants', {
			op: 'percentage',
			basisPoints: 10000,
			denominator: 'all-cards',
			predicate: participant
		});
		const d = await deck();
		await add(d.id, oakOracleId, 'commander');
		const main = await add(d.id, denizenOracleId);
		const oakCard = await card(oakOracleId);
		try {
			await database.pool.query(
				'UPDATE catalog_oracle_facts SET raw_oracle_id=NULL WHERE generation_id=(SELECT active_generation FROM catalog_state WHERE id=1) AND printing_id=$1',
				[oakCard.catalogCardId]
			);
			await review(d.id, 'entry');
			const entry = (await categories.getDeckEntryCategories(actor, d.id)).decisions.find(
				(e) => e.entryId === main
			);
			expect(entry?.evidence?.combo?.evaluations[0].participantTruth).toBe('False');
			await review(d.id, 'deck');
			expect(await whole(d.id, minimum.versionId)).toMatchObject({
				state: 'Automatic',
				truth: 'False',
				evidence: { bounds: { lower: '0', upper: '1' } }
			});
			expect(await whole(d.id, percentage.versionId)).toMatchObject({
				state: 'Automatic',
				truth: 'False'
			});
		} finally {
			await database.pool.query(
				'UPDATE catalog_oracle_facts SET raw_oracle_id=$1 WHERE generation_id=(SELECT active_generation FROM catalog_state WHERE id=1) AND printing_id=$2',
				[oakOracleId, oakCard.catalogCardId]
			);
		}
	});
	it.each(['entry', 'deck'] as const)(
		'fences %s previews on combo source/configuration changes and replays committed receipts after pruning and Deck deletion',
		async (scope) => {
			await save('entry', 'Preview participants', participant);
			await save('deck', 'Preview ingredients', outcome);
			const d = await deck();
			await add(d.id, oakOracleId);
			await add(d.id, denizenOracleId);
			await processJob(d.id);
			const p = await preview(d.id, scope);
			const prior = source!;
			const next = await publishComboFixture(database.pool);
			try {
				await expect(
					categories.commitCategoryChange(actor, { requestId: randomUUID(), previewId: p.id })
				).rejects.toMatchObject({ kind: 'RequestConflict' });
			} finally {
				await next.restore();
			}
			const configured = await preview(d.id, scope);
			configureComboAdapter(database.db, false);
			try {
				await expect(
					categories.commitCategoryChange(actor, {
						requestId: randomUUID(),
						previewId: configured.id
					})
				).rejects.toMatchObject({ kind: 'RequestConflict' });
			} finally {
				configureComboAdapter(database.db, true);
			}
			const fresh = await preview(d.id, scope);
			const input = { requestId: randomUUID(), previewId: fresh.id };
			const ack = await categories.commitCategoryChange(actor, input);
			const saved =
				scope === 'entry'
					? await categories.getDeckEntryCategories(actor, d.id)
					: await categories.getDeckWholeCategories(actor, d.id);
			// Physically prune the owned publication and restore its ambient predecessor afterwards.
			await prior.restore();
			source = undefined;
			expect(
				scope === 'entry'
					? await categories.getDeckEntryCategories(actor, d.id)
					: await categories.getDeckWholeCategories(actor, d.id)
			).toEqual(saved);
			expect(await categories.commitCategoryChange(actor, input)).toEqual(ack);
			await decks.deleteDeck(actor, d.id);
			expect(await categories.commitCategoryChange(actor, input)).toEqual(ack);
		}
	);

	it('retains prior-valid proof as Pending when the outcome disappears and preserves historical Manual versions across scoped Reset', async () => {
		const first = await save('deck', 'Original ingredients', outcome);
		await save('entry', 'Original participants', participant);
		const d = await deck();
		const oak = await add(d.id, oakOracleId);
		await add(d.id, denizenOracleId);
		await processJob(d.id);
		const valid = await whole(d.id, first.versionId);
		const removed = await publishComboFixture(database.pool, []);
		try {
			await decks.bulkMutateDeckCards(actor, {
				deckId: d.id,
				requestId: randomUUID(),
				source: 'web',
				game: 'mtg',
				operations: [{ op: 'increment', target: { entryId: oak }, quantity: 1 }]
			});
			await processJob(d.id);
			expect(await whole(d.id, first.versionId)).toMatchObject({
				state: 'Pending',
				truth: 'True',
				attemptedTruth: 'Unknown',
				evidence: valid!.evidence
			});
		} finally {
			await removed.restore();
		}
		await categories.setWholeCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			versionId: first.versionId,
			manual: 'Exclude',
			expectedDecisionRevision: (await categories.getDeckWholeCategories(actor, d.id))
				.decisionRevision
		});
		const entries = await categories.getDeckEntryCategories(actor, d.id);
		await categories.setEntryCategory(actor, {
			requestId: randomUUID(),
			deckId: d.id,
			entryId: oak,
			categoryId: null,
			expectedDecisionRevision: entries.decisionRevision
		});
		const newer = await save(
			'deck',
			'New ingredient meaning',
			{ op: 'not', child: outcome },
			['main', 'commander'],
			first.originId
		);
		await review(d.id, 'deck');
		expect(await whole(d.id, first.versionId)).toMatchObject({
			state: 'Manual',
			manual: 'Exclude'
		});
		expect(await whole(d.id, newer.versionId)).toMatchObject({
			state: 'Automatic',
			truth: 'False'
		});
		await review(d.id, 'entry', 'Reset');
		expect(await whole(d.id, first.versionId)).toMatchObject({
			state: 'Manual',
			manual: 'Exclude'
		});
		await review(d.id, 'deck', 'Reset');
		expect(await whole(d.id, first.versionId)).toBeUndefined();
		expect(
			(await categories.getDeckEntryCategories(actor, d.id)).decisions.find(
				(v) => v.entryId === oak
			)?.state
		).toBe('Automatic');
	});
	it('returns first-time Pending for disabled, missing and absent outcomes without positive membership', async () => {
		const w = await save('deck', 'Unavailable ingredients', outcome);
		for (const condition of ['disabled', 'missing', 'absent'] as const) {
			let absent: Awaited<ReturnType<typeof publishComboFixture>> | undefined;
			if (condition === 'disabled') configureComboAdapter(database.db, false);
			if (condition === 'missing')
				await database.pool.query('UPDATE combo_state SET active_publication=NULL WHERE id=1');
			if (condition === 'absent') absent = await publishComboFixture(database.pool, []);
			try {
				const d = await deck();
				await add(d.id, oakOracleId);
				await add(d.id, denizenOracleId);
				await processJob(d.id);
				expect(await whole(d.id, w.versionId)).toMatchObject({
					state: 'Pending',
					truth: null,
					attemptedTruth: 'Unknown'
				});
				expect(
					(await decks.getDeckLibrary(actor, { categoryVersionIds: [w.versionId] })).matchingTotal
				).toBe(0);
			} finally {
				configureComboAdapter(database.db, true);
				if (condition === 'missing')
					await database.pool.query('UPDATE combo_state SET active_publication=$1 WHERE id=1', [
						source!.publicationId
					]);
				await absent?.restore();
			}
		}
	});
	it('copies each Entry proving variant and every nested participant witness from local PostgreSQL rows', async () => {
		await source!.restore();
		const commanderVariant = {
			...recordedOakVariant,
			ingredients: [
				{ ...recordedOakVariant.ingredients[0], mustBeCommander: true },
				recordedOakVariant.ingredients[1]
			]
		};
		const mainVariant = {
			...recordedOakVariant,
			id: 'synthetic-main-oak',
			ingredients: [recordedOakVariant.ingredients[0]]
		};
		source = await publishComboFixture(database.pool, [commanderVariant, mainVariant]);
		const entries = [
			{
				entryId: 'commander-oak',
				printingId: 'same-oak',
				oracleId: oakOracleId,
				role: 'commander' as const,
				quantity: 1
			},
			{
				entryId: 'main-oak',
				printingId: 'same-oak',
				oracleId: oakOracleId,
				role: 'main' as const,
				quantity: 1
			},
			{
				entryId: 'denizen',
				printingId: 'denizen',
				oracleId: denizenOracleId,
				role: 'main' as const,
				quantity: 1
			}
		];
		const definition = {
			id: randomUUID(),
			roles: ['main', 'commander'] as CategoryRole[],
			rule: participant
		};
		const nested = {
			...definition,
			id: randomUUID(),
			rule: { op: 'minimumCopies' as const, minimum: 3, predicate: participant }
		};
		await categoryTransaction(database.db, async (tx) => {
			const facts = await readComboFacts(
				tx,
				entries,
				[definition, nested],
				await readComboSource(tx)
			);
			expect(facts.evidence(definition, 'main-oak').evaluations[0]).toMatchObject({
				truth: 'True',
				participantTruth: 'True',
				proof: { variant: mainVariant }
			});
			expect(facts.evidence(definition, 'commander-oak').evaluations[0]).toMatchObject({
				participantTruth: 'True',
				proof: { variant: commanderVariant }
			});
			expect(facts.evidence(nested).evaluations[0].participantWitnesses).toEqual([
				{
					proof: facts.forDefinition(nested)[0].participantProofs['commander-oak'],
					entryIds: ['commander-oak', 'denizen']
				},
				{
					proof: facts.forDefinition(nested)[0].participantProofs['main-oak'],
					entryIds: ['main-oak']
				}
			]);
			expect(facts.evidence({ ...definition, rule: outcome }).evaluations[0]).not.toHaveProperty(
				'participantWitnesses'
			);
			expect(facts.evidence(definition, 'unrelated').evaluations[0]).toMatchObject({
				participantTruth: 'False',
				proof: null
			});
			expect(JSON.stringify(facts.evidence(nested))).not.toContain('participantProofs');
		});

		await save('entry', 'Witness participants', participant);
		const aggregate = await save('deck', 'Witness count', {
			op: 'minimumCopies',
			minimum: 3,
			predicate: participant
		});
		const d = await deck();
		const commanderId = await add(d.id, oakOracleId, 'commander');
		const mainId = await add(d.id, oakOracleId);
		const denizenId = await add(d.id, denizenOracleId);
		await processJob(d.id);
		await review(d.id, 'entry');
		const saved = await categories.getDeckEntryCategories(actor, d.id);
		expect(
			saved.decisions.find((v) => v.entryId === mainId)?.evidence?.combo?.evaluations[0]
		).toMatchObject({ participantTruth: 'True', proof: { variant: mainVariant } });
		const witnesses = (await whole(d.id, aggregate.versionId))?.evidence?.combo?.evaluations[0]
			.participantWitnesses;
		expect(witnesses).toHaveLength(2);
		expect(witnesses?.find((w) => w.proof.variant.id === mainVariant.id)?.entryIds).toEqual([
			mainId
		]);
		expect(witnesses?.find((w) => w.proof.variant.id === commanderVariant.id)?.entryIds).toEqual(
			[commanderId, denizenId].sort()
		);
		expect(await whole(d.id, aggregate.versionId)).toMatchObject({
			truth: 'True',
			evidence: { bounds: { lower: '3', upper: '3' } }
		});
		// Concrete state/face uncertainty cannot make a different proven canonical card a participant.
		for (const constraint of [{ usedFace: 1 }, { states: { battlefieldCardState: 'tapped' } }]) {
			const constrained = await publishComboFixture(database.pool, [
				{
					...recordedOakVariant,
					ingredients: [{ ...recordedOakVariant.ingredients[0], ...constraint }]
				}
			]);
			try {
				await categoryTransaction(database.db, async (tx) => {
					const facts = await readComboFacts(tx, entries, [definition], await readComboSource(tx));
					expect(facts.evidence(definition, 'denizen').evaluations[0]).toMatchObject({
						participantTruth: 'False',
						proof: null
					});
					expect(facts.evidence(definition, 'main-oak').evaluations[0]).toMatchObject({
						participantTruth: 'Unknown',
						proof: null
					});
				});
			} finally {
				await constrained.restore();
			}
		}
	});
});
