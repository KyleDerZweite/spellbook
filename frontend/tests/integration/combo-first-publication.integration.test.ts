import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import {
	createCategories,
	createDatabase,
	createLocalAuth,
	createCatalog,
	createDecks
} from '@spellbook/backend';
import { publishComboFixture } from '../fixtures/combo.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('first Combo publication commit fence', () => {
	it('keeps the first publisher behind the actual null-source Reset commit until its receipt is stored', async () => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!, {
			commanderSpellbookEnabled: true
		});
		const auth = createLocalAuth(database.db, { demoMode: false }),
			categories = createCategories(database.db, auth),
			decks = createDecks(database.db, createCatalog(database.pool), auth);
		const prior = (
			await database.pool.query(
				'SELECT id,active_publication,previous_publication,refresh_status FROM combo_state WHERE id=1'
			)
		).rows[0];
		let actor: Awaited<ReturnType<typeof auth.authenticate>> = null;
		let blocker: PoolClient | undefined;
		let publication: Awaited<ReturnType<typeof publishComboFixture>> | undefined;
		let committing: Promise<unknown> | undefined,
			publishing: Promise<Awaited<ReturnType<typeof publishComboFixture>>> | undefined;
		async function blocked(fragment: string) {
			const until = Date.now() + 1000;
			while (Date.now() < until) {
				if (
					(
						await database.pool.query(
							"SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND strpos(query,$1)>0",
							[fragment]
						)
					).rowCount
				)
					return;
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			throw Error('Owned query did not wait for expected lock: ' + fragment);
		}
		try {
			await database.pool.query('DELETE FROM combo_state WHERE id=1');
			actor = await auth.authenticate(
				'register',
				'combo_first_' + randomUUID().slice(0, 8),
				'combo-first-publication-password'
			);
			if (!actor) throw Error('Fixture registration');
			const definition = await categories.saveDefinition(actor.user, {
				requestId: randomUUID(),
				originId: null,
				expectedLibraryRevision: '0',
				scope: 'deck',
				name: 'First publication',
				meaning: 'Local documented ingredients',
				priority: 0,
				displayOrder: 0,
				roles: ['main'],
				rule: { op: 'comboOutcome', outcomeId: '2244', policyVersion: 'ingredients-v1' },
				confirmRetainedRule: false
			});
			const deck = await decks.createDeckRecord(actor.user, {
				game: 'mtg',
				name: 'First publication fence',
				format: 'Commander',
				description: ''
			});
			await categories.setWholeCategory(actor.user, {
				requestId: randomUUID(),
				deckId: deck.id,
				versionId: definition.versionId,
				manual: 'Include',
				expectedDecisionRevision: (await categories.getDeckWholeCategories(actor.user, deck.id))
					.decisionRevision
			});
			const preview = await categories.previewCategoryChange(actor.user, {
				requestId: randomUUID(),
				deckId: deck.id,
				scope: 'deck',
				mode: 'Reset',
				restoreOriginIds: []
			});
			expect(preview.total).toBeGreaterThan(0);
			blocker = await database.pool.connect();
			await blocker.query('BEGIN');
			await blocker.query('LOCK TABLE deck_whole_categories IN ACCESS EXCLUSIVE MODE');
			const requestId = randomUUID();
			committing = categories.commitCategoryChange(actor.user, {
				requestId,
				previewId: preview.id
			});
			await blocked('deck_whole_categories');
			publishing = publishComboFixture(database.pool);
			await blocked('pg_advisory_xact_lock');
			expect(
				(await database.pool.query('SELECT count(*) FROM combo_state WHERE id=1')).rows[0].count
			).toBe('0');
			await blocker.query('COMMIT');
			const receipt = await committing;
			publication = await publishing;
			const stored = await categories.getDeckWholeCategories(actor.user, deck.id);
			expect(
				stored.categories[0].decision?.previousEvaluation?.combo?.source.publicationId
			).toBeNull();
			expect(
				(await database.pool.query('SELECT active_publication FROM combo_state WHERE id=1')).rows[0]
					.active_publication
			).toBe(publication.publicationId);
			expect(
				await categories.commitCategoryChange(actor.user, { requestId, previewId: preview.id })
			).toEqual(receipt);
		} finally {
			if (blocker) {
				await blocker.query('ROLLBACK');
				blocker.release();
			}
			await committing?.catch(() => {});
			if (publishing && !publication) publication = await publishing;
			if (actor)
				await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [
					actor.user.accountId
				]);
			await publication?.restore();
			if (prior)
				await database.pool.query(
					'INSERT INTO combo_state(id,active_publication,previous_publication,refresh_status) VALUES(1,$1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET active_publication=excluded.active_publication,previous_publication=excluded.previous_publication,refresh_status=excluded.refresh_status',
					[
						prior.active_publication,
						prior.previous_publication,
						JSON.stringify(prior.refresh_status)
					]
				);
			await database.pool.end();
		}
	}, 10000);
});
