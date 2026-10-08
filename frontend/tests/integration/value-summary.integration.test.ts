import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	createDatabase,
	createLocalAuth,
	createValuation,
	createDashboard
} from '@spellbook/backend';
import { createInventoryValues } from '@spellbook/backend/valuation/inventory-value.ts';
import { createDecks } from '@spellbook/backend/decks/application.ts';
import { createCatalog } from '@spellbook/backend/catalog/search.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('consistent Dashboard and selected Deck value summaries', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const valuation = createValuation(database.pool, auth);
	const values = createInventoryValues(database.pool, auth, valuation);
	const dashboard = createDashboard(database.pool, auth, values);
	const deckApp = createDecks(database.db, createCatalog(database.pool), auth, valuation);
	const publication = crypto.randomUUID(),
		printing = crypto.randomUUID(),
		oracle = crypto.randomUUID();
	const deckId = crypto.randomUUID(),
		entry = crypto.randomUUID(),
		inventory = crypto.randomUUID();
	let actor: AuthUser, previous: Record<string, unknown>;
	beforeAll(async () => {
		actor = (await auth.authenticate(
			'register',
			'summary_' + crypto.randomUUID().slice(0, 8),
			'summary-test-password'
		))!.user;
		previous = (await database.pool.query('SELECT * FROM price_state WHERE id=1')).rows[0];
		await database.pool.query(
			`INSERT INTO price_publications(id,catalog_generation_id,descriptor,source_type,source_updated_at,payload_digest,extractor_version,mapping_version) VALUES($1,$2,'{"source":"Scryfall"}','all_cards',now(),'summary',1,1)`,
			[publication, crypto.randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_printings(publication_id,id,oracle_id,set_id,set_code,collector_number,lang,finishes,variant_key,identity,links) VALUES($1,$2,$3,$4,'cmm','703','en',ARRAY['nonfoil','foil'],'matched','{"lang":"en"}','[]')`,
			[publication, printing, oracle, crypto.randomUUID()]
		);
		await database.pool.query(
			`INSERT INTO price_observations(publication_id,printing_id,finish,measure,amount,supported) VALUES($1,$2,'nonfoil','prices.eur',0.005,true),($1,$2,'foil','prices.eur_foil',0,true)`,
			[publication, printing]
		);
		await database.pool.query(
			`UPDATE price_state SET active_publication=$1,previous_publication=NULL,refresh_status='{"kind":"Succeeded"}' WHERE id=1`,
			[publication]
		);
		await database.pool.query(`INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')`, [
			inventory,
			actor.accountId
		]);
		await database.pool.query(
			`INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,notes,spellbook_position) VALUES($1,$2,$3,'mtg',$4,$5,'Summary','cmm','',1,'foil','NM','',0)`,
			[entry, inventory, actor.accountId, printing, oracle]
		);
		await database.pool.query(
			`INSERT INTO decks(id,account_id,game,name,description,format) VALUES($1,$2,'mtg','Summary','','Modern')`,
			[deckId, actor.accountId]
		);
		for (const role of ['main', 'sideboard'])
			await database.pool.query(
				`INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,role) VALUES($1,$2,$3,'mtg',$4,$5,'Summary','cmm','',1,$6)`,
				[crypto.randomUUID(), deckId, actor.accountId, printing, oracle, role]
			);
	});
	afterAll(async () => {
		await database.pool.query(
			'UPDATE price_state SET active_publication=$1,previous_publication=$2,refresh_status=$3 WHERE id=1',
			[previous.active_publication, previous.previous_publication, previous.refresh_status]
		);
		await database.pool.query('DELETE FROM price_publications WHERE id=$1', [publication]);
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	it('uses exact products and existing nonreserving availability, with independent selected and empty states', async () => {
		const summary = await dashboard.get(actor);
		expect(summary.inventoryValue?.estimate).toMatchObject({
			coveredValue: '0.00',
			coveredQuantity: 1,
			complete: true
		});
		expect(summary.inventoryValueHistory?.window.days).toBe(30);
		expect(summary.inventoryValue?.evaluatedAt).toBe(summary.inventoryValueHistory?.asOf);
		const deck = await deckApp.getDeckSnapshot(actor, 'mtg', deckId);
		expect(deck.valueEstimates?.required).toMatchObject({
			coveredValue: '0.01',
			totalQuantity: 2,
			coveredQuantity: 2
		});
		expect(deck.valueEstimates?.missing).toMatchObject({ coveredValue: '0.01', totalQuantity: 1 });
		expect(Object.values(deck.availability).reduce((sum, row) => sum + row.missing, 0)).toBe(1);
		expect((await deckApp.getDeckSnapshot(actor)).valueEstimates).toBeNull();
		const empty = await deckApp.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Empty',
			description: '',
			format: 'Modern'
		});
		expect(
			(await deckApp.getDeckSnapshot(actor, 'mtg', empty.id)).valueEstimates?.required
		).toMatchObject({ coveredValue: '0.00', totalQuantity: 0, complete: true });
	});
	it('keeps account data readable after a real SQL price failure using savepoints', async () => {
		const failing = {
			...valuation,
			async readInTransaction(executor: Parameters<typeof valuation.readInTransaction>[0]) {
				await executor.query('SELECT * FROM summary_price_table_does_not_exist');
				throw Error('unreachable');
			}
		};
		const summary = await createDashboard(
			database.pool,
			auth,
			createInventoryValues(database.pool, auth, failing)
		).get(actor);
		expect(summary.totals.total).toBe(1);
		expect(summary.recentEntries).toHaveLength(1);
		expect(summary.inventoryValue).toBeNull();
		expect(summary.valuationError?.kind).toBe('PriceReadUnavailable');
		const deck = await createDecks(
			database.db,
			createCatalog(database.pool),
			auth,
			failing
		).getDeckSnapshot(actor, 'mtg', deckId);
		expect(deck.deckCards).toHaveLength(2);
		expect(deck.valueEstimates).toBeNull();
		expect(deck.valuationError?.kind).toBe('PriceReadUnavailable');
	});
	it('reads holdings and prices from one snapshot during a concurrent commit', async () => {
		const entered = Promise.withResolvers<void>(),
			release = Promise.withResolvers<void>();
		const paused = {
			...valuation,
			async readInTransaction(...args: Parameters<typeof valuation.readInTransaction>) {
				entered.resolve();
				await release.promise;
				return valuation.readInTransaction(...args);
			}
		};
		const reading = createDashboard(
			database.pool,
			auth,
			createInventoryValues(database.pool, auth, paused)
		).get(actor);
		await entered.promise;
		await database.pool.query(`UPDATE inventory_cards SET quantity=3 WHERE id=$1`, [entry]);
		await database.pool.query(
			`UPDATE price_observations SET amount=2 WHERE publication_id=$1 AND finish='foil'`,
			[publication]
		);
		release.resolve();
		const result = await reading;
		expect(result.totals.total).toBe(1);
		expect(result.inventoryValue?.estimate).toMatchObject({
			coveredQuantity: 1,
			coveredValue: '0.00'
		});
		const latest = await dashboard.get(actor);
		expect(latest.inventoryValue?.estimate).toMatchObject({
			coveredQuantity: 3,
			coveredValue: '6.00'
		});
	});
	it('keeps a selected Deck snapshot coherent through concurrent allocation and price writes', async () => {
		await database.pool.query('UPDATE inventory_cards SET quantity=1 WHERE id=$1', [entry]);
		const entered = Promise.withResolvers<void>(),
			release = Promise.withResolvers<void>();
		const paused = {
			...valuation,
			async readInTransaction(...args: Parameters<typeof valuation.readInTransaction>) {
				entered.resolve();
				await release.promise;
				return valuation.readInTransaction(...args);
			}
		};
		const application = createDecks(database.db, createCatalog(database.pool), auth, paused);
		const reading = application.getDeckSnapshot(actor, 'mtg', deckId);
		await entered.promise;
		await database.pool.query('UPDATE inventory_cards SET quantity=2 WHERE id=$1', [entry]);
		await database.pool.query(
			`UPDATE price_observations SET amount=3 WHERE publication_id=$1 AND finish='nonfoil'`,
			[publication]
		);
		release.resolve();
		const result = await reading;
		expect(result.valueEstimates?.required.coveredValue).toBe('0.01');
		expect(result.valueEstimates?.missing.totalQuantity).toBe(1);
		const latest = await deckApp.getDeckSnapshot(actor, 'mtg', deckId);
		expect(latest.valueEstimates?.required.coveredValue).toBe('6.00');
		expect(latest.valueEstimates?.missing).toMatchObject({
			totalQuantity: 0,
			coveredValue: '0.00',
			complete: true
		});
	});
	it('distinguishes stale coverage and unknown references without changing availability', async () => {
		await database.pool.query(
			`UPDATE price_publications SET source_updated_at=now()-interval '2 days' WHERE id=$1`,
			[publication]
		);
		let result = await deckApp.getDeckSnapshot(actor, 'mtg', deckId);
		expect(result.valueEstimates?.required).toMatchObject({
			coveredQuantity: 2,
			staleQuantity: 2,
			unknownQuantity: 0,
			complete: true
		});
		await database.pool.query(
			`UPDATE price_observations SET amount=NULL WHERE publication_id=$1 AND finish='nonfoil'`,
			[publication]
		);
		result = await deckApp.getDeckSnapshot(actor, 'mtg', deckId);
		expect(result.valueEstimates?.required).toMatchObject({
			coveredQuantity: 0,
			staleQuantity: 0,
			unknownQuantity: 2,
			complete: false,
			coveredValue: '0.00'
		});
		expect(result.valuationError).toBeNull();
		expect(result.valueEstimates?.missing).toMatchObject({ totalQuantity: 0, complete: true });
	});
	it('isolates the authenticated account across all summaries', async () => {
		const other = (await auth.authenticate(
			'register',
			'other_' + crypto.randomUUID().slice(0, 8),
			'summary-test-password'
		))!.user;
		try {
			const result = await dashboard.get(other);
			expect(result.inventoryValue?.estimate).toMatchObject({
				totalQuantity: 0,
				complete: true,
				coveredValue: '0.00'
			});
			expect(result.decks).toEqual([]);
			await expect(deckApp.getDeckSnapshot(other, 'mtg', deckId)).rejects.toMatchObject({
				notFound: true
			});
		} finally {
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [other.accountId]);
		}
	});
});
