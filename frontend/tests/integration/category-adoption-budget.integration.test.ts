import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, createLocalAuth, createCatalog, createDecks } from '@spellbook/backend';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('Category deadlines in parent-owned Deck adoption', () => {
	let database: ReturnType<typeof createDatabase>,
		actor: AuthUser,
		decks: ReturnType<typeof createDecks>;
	let card: {
		catalogCardId: string;
		canonicalCardId: string;
		name: string;
		setCode: string;
		imageUri: string;
	};
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		const auth = createLocalAuth(database.db, { demoMode: false });
		const session = await auth.authenticate(
			'register',
			'category_budget_' + randomUUID().slice(0, 8),
			'category-budget-integration-password'
		);
		if (!session) throw Error('Register');
		actor = session.user;
		decks = createDecks(database.db, createCatalog(database.pool), auth);
		const printing = (
			await database.pool.query(
				"SELECT p.id,p.oracle_id,p.name,p.set_code,p.document->>'image_uri' AS image_uri FROM catalog_printings p JOIN catalog_state s ON s.active_generation=p.generation_id ORDER BY p.id LIMIT 1"
			)
		).rows[0];
		card = {
			catalogCardId: printing.id,
			canonicalCardId: printing.oracle_id,
			name: printing.name,
			setCode: printing.set_code,
			imageUri: printing.image_uri ?? ''
		};
	});
	afterAll(async () => {
		if (actor)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=$1', [actor.accountId]);
		await database.pool.end();
	});
	const create = () =>
		decks.createDeckRecord(actor, {
			game: 'mtg',
			name: 'Budget rollback',
			description: '',
			format: 'Modern'
		});
	const add = (deckId: string, requestId = randomUUID()) =>
		decks.bulkMutateDeckCards(actor, {
			deckId,
			requestId,
			source: 'web',
			game: 'mtg',
			operations: [{ op: 'add', card, quantity: 1, role: 'main' }]
		});
	it('rejects saturated acquisition for actual new-Deck and add commands without queuing or effects', async () => {
		const held = await Promise.all(Array.from({ length: 10 }, () => database.pool.connect()));
		try {
			await expect(create()).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			await expect(add(randomUUID())).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			for (const caller of [decks.addDeckCard, decks.addCatalogCardToDeck])
				await expect(
					caller(actor, {
						deckId: randomUUID(),
						requestId: randomUUID(),
						...card,
						quantity: 1,
						role: 'main'
					})
				).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(database.pool.waitingCount).toBe(0);
		} finally {
			held.forEach((c) => c.release());
		}
		expect(
			(
				await database.pool.query('SELECT count(*)::int AS n FROM decks WHERE account_id=$1', [
					actor.accountId
				])
			).rows[0].n
		).toBe(0);
	});
	it('cancels blocked Library adoption in the original new-Deck transaction and rolls back its inserted Deck', async () => {
		const lock = await database.pool.connect();
		try {
			await lock.query('BEGIN');
			await lock.query('LOCK TABLE category_definition_versions IN ACCESS EXCLUSIVE MODE');
			await expect(create()).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
		} finally {
			await lock.query('ROLLBACK');
			lock.release();
		}
		expect(
			(
				await database.pool.query('SELECT count(*)::int AS n FROM decks WHERE account_id=$1', [
					actor.accountId
				])
			).rows[0].n
		).toBe(0);
	});
	it('cancels real adoption SQL through new-Deck and Main-add paths and rolls back Deck, entries and original receipts', async () => {
		const deckId = randomUUID(),
			requestId = randomUUID();
		await database.pool.query(
			"INSERT INTO decks(id,account_id,game,name,format) VALUES($1,$2,'mtg','Legacy budget','Modern')",
			[deckId, actor.accountId]
		);
		const name = 'category16_adoption_' + randomUUID().replaceAll('-', '');
		try {
			await database.pool.query(
				`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (SELECT account_id FROM decks WHERE id=NEW.deck_id)='${actor.accountId}' THEN PERFORM pg_sleep(6); END IF; RETURN NEW; END $$`
			);
			await database.pool.query(
				`CREATE TRIGGER ${name} BEFORE INSERT ON deck_category_bundles FOR EACH ROW EXECUTE FUNCTION ${name}()`
			);
			await expect(create()).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			await expect(add(deckId, requestId)).rejects.toMatchObject({ kind: 'CategoryUnavailable' });
			expect(
				(
					await database.pool.query('SELECT count(*)::int AS n FROM decks WHERE account_id=$1', [
						actor.accountId
					])
				).rows[0].n
			).toBe(1);
			expect(
				(
					await database.pool.query('SELECT count(*)::int AS n FROM deck_cards WHERE deck_id=$1', [
						deckId
					])
				).rows[0].n
			).toBe(0);
			expect(
				(
					await database.pool.query(
						'SELECT count(*)::int AS n FROM deck_category_bundles WHERE deck_id=$1',
						[deckId]
					)
				).rows[0].n
			).toBe(0);
			expect(
				(
					await database.pool.query(
						'SELECT count(*)::int AS n FROM deck_mutation_requests WHERE account_id=$1 AND request_id=$2',
						[actor.accountId, requestId]
					)
				).rows[0].n
			).toBe(0);
		} finally {
			await database.pool.query(`DROP TRIGGER IF EXISTS ${name} ON deck_category_bundles`);
			await database.pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
		}
	}, 14000);
	it('actual web and mobile Main-add callers replay original receipts before Catalog reads and bound blocked Catalog resolution', async () => {
		const deck = await create();
		for (const caller of [decks.addDeckCard, decks.addCatalogCardToDeck]) {
			const intent = {
				...card,
				deckId: deck.id,
				quantity: 1,
				role: 'main',
				requestId: randomUUID()
			};
			const acknowledgement = await caller(actor, intent);
			const lock = await database.pool.connect();
			try {
				await lock.query('BEGIN');
				await lock.query('LOCK TABLE catalog_printings IN ACCESS EXCLUSIVE MODE');
				await expect(caller(actor, intent)).resolves.toEqual(acknowledgement);
				await expect(caller(actor, { ...intent, requestId: randomUUID() })).rejects.toMatchObject({
					kind: 'CategoryUnavailable'
				});
			} finally {
				await lock.query('ROLLBACK');
				lock.release();
			}
		}
		expect(
			(
				await database.pool.query(
					'SELECT sum(quantity)::int AS n FROM deck_cards WHERE deck_id=$1',
					[deck.id]
				)
			).rows[0].n
		).toBe(2);
		expect(
			(
				await database.pool.query(
					'SELECT count(*)::int AS n FROM deck_mutation_requests WHERE deck_id=$1',
					[deck.id]
				)
			).rows[0].n
		).toBe(2);
	}, 14000);
});
