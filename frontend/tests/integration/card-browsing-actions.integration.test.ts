import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { application } from '#lib/server/composition.ts';
import { addToDeck, addBrowsingToInventory } from '#lib/server/card-browsing-actions.ts';
import { ensureDeckCatalogFixture } from '../deck-catalog-fixture.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('shared native action adapters over disposable PostgreSQL', () => {
	const url = process.env.TEST_DATABASE_URL;
	const pool = new pg.Pool({ connectionString: url });
	let owner: AuthUser,
		foreign: AuthUser,
		printing: string,
		deckId: string,
		foreignDeckId: string,
		finish: string;
	let foreignToken = '';
	const accounts: string[] = [];
	const event = (actor: AuthUser, fields: Record<string, string>) =>
		({
			locals: { user: actor },
			request: new Request('https://spellbook.test/mtg/search', {
				method: 'POST',
				body: new URLSearchParams(fields)
			})
		}) as never;
	beforeAll(async () => {
		if (!url || url !== process.env.DATABASE_URL)
			throw Error('Matching disposable database references required');
		expect((await pool.query('SELECT current_database() AS name')).rows[0].name).toBe(
			new URL(url).pathname.slice(1)
		);
		await ensureDeckCatalogFixture(pool);
		const first = await application.auth.authenticate(
			'register',
			'sharedpg_' + crypto.randomUUID().slice(0, 8),
			'shared-pg-fixture-password'
		);
		const second = await application.auth.authenticate(
			'register',
			'foreignpg_' + crypto.randomUUID().slice(0, 8),
			'shared-pg-fixture-password'
		);
		if (!first || !second) throw Error('Missing fixture sessions');
		owner = first.user;
		foreign = second.user;
		foreignToken = second.session.token;
		accounts.push(owner.accountId, foreign.accountId);
		const card = (await pool.query('SELECT document FROM catalog_printings LIMIT 1')).rows[0]
			.document;
		printing = card.id;
		finish = card.is_nonfoil_available ? 'nonfoil' : 'foil';
		deckId = (
			await application.decks.createDeckRecord(owner, {
				game: 'mtg',
				name: 'Own target',
				format: 'Commander',
				description: ''
			})
		).id;
		foreignDeckId = (
			await application.decks.createDeckRecord(foreign, {
				game: 'mtg',
				name: 'Foreign target',
				format: 'Commander',
				description: ''
			})
		).id;
	});
	afterAll(async () => {
		for (const account of accounts)
			await pool.query('DELETE FROM user_profiles WHERE account_id=$1', [account]);
		await pool.end();
	});
	it('actual adapter preserves all four roles and original receipts across replay without duplicate quantities', async () => {
		for (const role of ['main', 'sideboard', 'commander', 'companion']) {
			const draft = {
				catalogCardId: printing,
				deckId,
				role,
				quantity: '3',
				requestId: crypto.randomUUID()
			};
			const first = await addToDeck(event(owner, draft));
			expect(first).toMatchObject({
				success: true,
				acknowledgement: { requestId: draft.requestId, deckId }
			});
			expect(await addToDeck(event(owner, draft))).toEqual(first);
			expect(
				(
					await pool.query('SELECT quantity FROM deck_cards WHERE deck_id=$1 AND role=$2', [
						deckId,
						role
					])
				).rows[0].quantity
			).toBe(3);
		}
	});
	it('foreign targets and stale request intent retain exact safe drafts without unauthorized write', async () => {
		const draft = {
			catalogCardId: printing,
			deckId: foreignDeckId,
			role: 'sideboard',
			quantity: '7',
			requestId: crypto.randomUUID()
		};
		expect(await addToDeck(event(owner, draft))).toMatchObject({
			status: 404,
			data: { deckAdditionDraft: draft }
		});
		const original = { ...draft, deckId };
		await addToDeck(event(owner, original));
		expect(await addToDeck(event(owner, { ...original, quantity: '8' }))).toMatchObject({
			status: 409,
			data: { deckAdditionDraft: { ...original, quantity: '8' } }
		});
		expect(
			(await pool.query('SELECT count(*) FROM deck_cards WHERE deck_id=$1', [foreignDeckId]))
				.rows[0].count
		).toBe('0');
	});
	it('Inventory adapter applies supported genuine finish and replays one original addition', async () => {
		const original = {
			catalogCardId: printing,
			finish,
			condition: 'LP',
			quantity: '4',
			requestId: crypto.randomUUID()
		};
		const first = await addBrowsingToInventory(event(owner, original));
		expect(first).toMatchObject({
			success: true,
			acknowledgement: { requestId: original.requestId }
		});
		expect(await addBrowsingToInventory(event(owner, original))).toEqual(first);
		expect(
			(
				await pool.query(
					'SELECT quantity,finish,condition FROM inventory_cards WHERE account_id=$1',
					[owner.accountId]
				)
			).rows
		).toEqual([{ quantity: 4, finish, condition: 'LP' }]);
	});
	it('actual session revocation rejects both cached actor commands without any late commit', async () => {
		await application.auth.revokeSession(foreignToken);
		const requestId = crypto.randomUUID();
		expect(
			await addToDeck(
				event(foreign, {
					catalogCardId: printing,
					deckId: foreignDeckId,
					role: 'main',
					quantity: '1',
					requestId
				})
			)
		).toMatchObject({ status: 401, data: { uncertain: false } });
		expect(
			await addBrowsingToInventory(
				event(foreign, {
					catalogCardId: printing,
					finish,
					condition: 'NM',
					quantity: '1',
					requestId
				})
			)
		).toMatchObject({ status: 401, data: { uncertain: false } });
		expect(
			(await pool.query('SELECT count(*) FROM deck_cards WHERE deck_id=$1', [foreignDeckId]))
				.rows[0].count
		).toBe('0');
	});
});
