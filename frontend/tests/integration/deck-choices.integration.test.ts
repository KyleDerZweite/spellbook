import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { createDecks, createCatalog, createLocalAuth } from '@spellbook/backend';
import * as schema from '@spellbook/backend/db/schema.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { Deck } from '@spellbook/contracts/decks.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('bounded owned Deck choices over PostgreSQL', () => {
	const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
	const queries: { sql: string; params: unknown[] }[] = [];
	const db = drizzle(pool, {
		schema,
		logger: {
			logQuery(sql, params) {
				queries.push({ sql, params });
			}
		}
	});
	const auth = createLocalAuth(db, { demoMode: false });
	const application = createDecks(db, createCatalog(pool), auth);
	let actor: AuthUser, foreign: AuthUser;
	let accountIds: string[] = [];
	let owned: Deck[];
	const input = (name: string) => ({
		game: 'mtg',
		name,
		format: 'Modern',
		description: 'private-description'.repeat(100)
	});
	beforeAll(async () => {
		const databaseUrl = process.env.TEST_DATABASE_URL;
		if (!databaseUrl || databaseUrl !== process.env.DATABASE_URL)
			throw Error('Matching disposable DB references required');
		expect((await pool.query('select current_database() as name')).rows[0].name).toBe(
			new URL(databaseUrl).pathname.slice(1)
		);
	});
	beforeEach(async () => {
		const one = await auth.authenticate(
			'register',
			'choices_' + crypto.randomUUID().slice(0, 8),
			'choices-integration-password'
		);
		const two = await auth.authenticate(
			'register',
			'foreign_' + crypto.randomUUID().slice(0, 8),
			'choices-integration-password'
		);
		if (!one || !two) throw Error('Fixture registration failed');
		actor = one.user;
		foreign = two.user;
		accountIds = [actor.accountId, foreign.accountId];
		owned = [];
		for (let i = 0; i < 61; i++)
			owned.push(
				await application.createDeckRecord(actor, input('Deck' + String(i).padStart(2, '0')))
			);
	});
	afterEach(async () => {
		for (const accountId of accountIds)
			await db.delete(schema.userProfiles).where(eq(schema.userProfiles.accountId, accountId));
	});
	afterAll(async () => {
		await pool.end();
	});
	it('pages beyond50 with deterministic ties, a bounded selected lookup, and no heavy reads', async () => {
		queries.length = 0;
		const first = await application.getDeckChoices(actor, { selectedDeckId: owned[60].id });
		expect(first.items).toHaveLength(20);
		expect(first.nextOffset).toBe(20);
		expect(first.selected).toEqual({ id: owned[60].id, name: 'Deck60', format: 'Modern' });
		const deckReads = queries.filter((q) => q.sql.includes('from "decks"'));
		expect(deckReads).toHaveLength(2);
		expect(deckReads[0].params.at(-1)).toBe(21);
		expect(deckReads[0].sql).toMatch(/limit \$\d+/i);
		expect(deckReads[1].params.at(-1)).toBe(1);
		for (const q of queries)
			expect(q.sql).not.toMatch(/deck_cards|inventory_cards|description|count\(/i);
		const ids = first.items.map((d) => d.id);
		for (const offset of [20, 40, 60]) {
			const page = await application.getDeckChoices(actor, { offset });
			ids.push(...page.items.map((d) => d.id));
			expect(page.nextOffset).toBe(offset === 60 ? null : offset + 20);
			expect(page.selected).toBeNull();
		}
		expect(ids).toEqual(owned.map((d) => d.id));
		expect((await application.getDeckChoices(actor, { limit: 50 })).items).toHaveLength(50);
		expect((await application.getDeckChoices(actor, { offset: 1_000_000 })).items).toEqual([]);
		for (const d of first.items) expect(Object.keys(d).sort()).toEqual(['format', 'id', 'name']);
		const tied = await Promise.all([
			application.createDeckRecord(actor, input('Same')),
			application.createDeckRecord(actor, input('Same'))
		]);
		expect(
			(await application.getDeckChoices(actor, { query: 'same' })).items.map((d) => d.id)
		).toEqual(tied.map((d) => d.id).sort());
	});
	it('matches percent, underscore and backslash literally without trimming or wildcard expansion', async () => {
		for (const name of ['100% Win', '100_any', 'Back\\Slash', 'Surround Space '])
			await application.createDeckRecord(actor, input(name));
		for (const [query, expected] of [
			['%', '100% Win'],
			['_', '100_any'],
			['\\', 'Back\\Slash'],
			['DECK60', 'Deck60']
		]) {
			expect((await application.getDeckChoices(actor, { query })).items.map((d) => d.name)).toEqual(
				[expected]
			);
		}
		expect((await application.getDeckChoices(actor, { query: ' Space ' })).items).toEqual([]);
	});
	it('returns null for foreign, absent or deleted selection and never implicitly selects', async () => {
		const foreignDeck = await application.createDeckRecord(foreign, input('Foreign'));
		for (const selectedDeckId of [foreignDeck.id, crypto.randomUUID()]) {
			const page = await application.getDeckChoices(actor, { query: 'no match', selectedDeckId });
			expect(page).toEqual({ items: [], nextOffset: null, selected: null });
		}
		await application.deleteDeck(actor, owned[60].id);
		expect(
			(await application.getDeckChoices(actor, { selectedDeckId: owned[60].id })).selected
		).toBeNull();
		expect((await application.getDeckChoices(actor)).selected).toBeNull();
	});
	it('rejects invalid runtime values and unknown keys before any Deck query', async () => {
		for (const bad of [
			null,
			[],
			{ extra: true },
			{ accountId: foreign.accountId },
			{ query: 7 },
			{ query: null },
			{ query: '\0' },
			{ query: 'x'.repeat(201) },
			{ offset: -1 },
			{ offset: 1.5 },
			{ offset: '1' },
			{ offset: null },
			{ offset: 1_000_001 },
			{ offset: Infinity },
			{ limit: 0 },
			{ limit: 51 },
			{ limit: 1.5 },
			{ limit: null },
			{ selectedDeckId: '' },
			{ selectedDeckId: foreign.accountId + 'x' }
		]) {
			queries.length = 0;
			await expect(
				Reflect.apply(application.getDeckChoices, null, [actor, bad])
			).rejects.toMatchObject({ name: 'ValidationError' });
			expect(queries.filter((q) => q.sql.includes('from "decks"'))).toEqual([]);
		}
	});
	it('rejects copied or revoked actors and derives authority independently of mutated DTO fields', async () => {
		await expect(application.getDeckChoices({ ...actor })).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		const original = actor.accountId;
		actor.accountId = foreign.accountId;
		expect((await application.getDeckChoices(actor)).items.map((d) => d.id)).toEqual(
			owned.slice(0, 20).map((d) => d.id)
		);
		actor.accountId = original;
		await pool.query('delete from auth_sessions where account_id=$1', [actor.accountId]);
		await expect(application.getDeckChoices(actor)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
	});
});
