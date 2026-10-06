import { seedAccountScaleInventory } from '../fixtures/account-scale.ts';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, createLocalAuth } from '@spellbook/backend';
import { createProfile } from '@spellbook/backend/profile/profile.ts';
import { defaultProfileCard } from '@spellbook/contracts/profile-card.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('authorized account profile patches', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const profile = createProfile(database.db, auth, { demoMode: false });
	const accounts: string[] = [];
	afterAll(async () => {
		if (accounts.length)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
				accounts
			]);
		await database.pool.end();
	});
	it('preserves independent fields and rejects fabricated actors and revoked sessions', async () => {
		const account = await auth.authenticate(
			'register',
			`profile_${crypto.randomUUID().slice(0, 8)}`,
			'test-account-profile-password'
		);
		expect(account).not.toBeNull();
		accounts.push(account!.user.accountId);
		await Promise.all([
			profile.patch(account!.user, { email: 'mage@example.test' }),
			profile.patch(account!.user, { avatarId: 'slime' })
		]);
		const saved = await profile.get(account!.user);
		expect(saved.user).toMatchObject({ email: 'mage@example.test', avatarId: 'slime' });
		expect(saved.card).toEqual(defaultProfileCard(account!.user.username));
		await profile.patch(account!.user, { profileCard: { name: 'Collector' } });
		await profile.patch(account!.user, { profileCard: { flavorText: 'Saved independently' } });
		expect((await profile.get(account!.user)).card).toMatchObject({
			name: 'Collector',
			flavorText: 'Saved independently'
		});
		await expect(
			profile.patch({ ...account!.user }, { email: 'forged@example.test' })
		).rejects.toMatchObject({ kind: 'Unauthenticated' });
		await auth.revokeSession(account!.session.token);
		await expect(profile.get(account!.user)).rejects.toMatchObject({ kind: 'Unauthenticated' });
	});
	it('preserves weighted Dashboard totals, fixed empty buckets, recent ordering and independent deck availability', async () => {
		const { createDashboard } = await import('@spellbook/backend');
		const { readFile } = await import('node:fs/promises');
		const cards = JSON.parse(
			await readFile(new URL('../../scripts/demo/cards.json', import.meta.url), 'utf8')
		) as import('@spellbook/contracts/catalog.ts').CardDocument[];
		const a = cards[0],
			b = cards.find((card) => card.set_code === a.set_code && card.oracle_id !== a.oracle_id)!,
			c = cards.find((card) => card.set_code !== a.set_code && card.oracle_id !== a.oracle_id)!;
		expect(b).toBeDefined();
		expect(c).toBeDefined();
		const account = (await auth.authenticate(
			'register',
			`weighted_${crypto.randomUUID().slice(0, 8)}`,
			'weighted-dashboard-password'
		))!;
		accounts.push(account.user.accountId);
		const dashboard = createDashboard(database.pool, auth);
		const empty = await dashboard.get(account.user);
		expect(empty.totals).toEqual({ total: 0, names: 0, printings: 0, sets: 0, foils: 0, decks: 0 });
		expect(empty.finishes.map((row) => row.share)).toEqual([0, 0]);
		expect(empty.recentEntries).toEqual([]);
		const inventoryId = crypto.randomUUID();
		await database.pool.query("INSERT INTO inventories(id,account_id,game) VALUES($1,$2,'mtg')", [
			inventoryId,
			account.user.accountId
		]);
		const entries = [
			{ card: a, quantity: 4, finish: 'nonfoil', condition: 'NM' },
			{ card: a, quantity: 3, finish: 'foil', condition: 'LP' },
			{ card: b, quantity: 2, finish: 'foil', condition: 'NM' },
			{ card: c, quantity: 1, finish: 'nonfoil', condition: 'DMG' }
		];
		const ids: string[] = [];
		for (const [index, entry] of entries.entries()) {
			const id = crypto.randomUUID();
			ids.push(id);
			await database.pool.query(
				"INSERT INTO inventory_cards(id,inventory_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position,updated_at) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,$9,$10,$11,0,$12)",
				[
					id,
					inventoryId,
					account.user.accountId,
					entry.card.id,
					entry.card.oracle_id,
					entry.card.name,
					entry.card.set_code,
					entry.card.image_uri,
					entry.quantity,
					entry.finish,
					entry.condition,
					new Date(2026, 9, index + 1)
				]
			);
		}
		const decks = [crypto.randomUUID(), crypto.randomUUID()];
		for (const [index, id] of decks.entries()) {
			await database.pool.query(
				"INSERT INTO decks(id,account_id,game,name) VALUES($1,$2,'mtg',$3)",
				[id, account.user.accountId, `Deck ${index}`]
			);
			await database.pool.query(
				"INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,8)",
				[
					crypto.randomUUID(),
					id,
					account.user.accountId,
					a.id,
					a.oracle_id,
					a.name,
					a.set_code,
					a.image_uri
				]
			);
		}
		const summary = await dashboard.get(account.user);
		expect(summary.totals).toEqual({
			total: 10,
			names: 3,
			printings: 3,
			sets: 2,
			foils: 5,
			decks: 2
		});
		expect(summary.finishes.map((row) => row.quantity)).toEqual([5, 5]);
		expect(summary.conditions.map((row) => row.quantity)).toEqual([6, 3, 0, 0, 1]);
		expect(summary.sets).toEqual([
			{ label: a.set_code, quantity: 9, share: 0.9 },
			{ label: c.set_code, quantity: 1, share: 0.1 }
		]);
		expect(summary.recentEntries.map((row) => row.id)).toEqual(ids.toReversed());
		expect(
			summary.decks.map(({ required, exact, alternate, missing }) => ({
				required,
				exact,
				alternate,
				missing
			}))
		).toEqual([
			{ required: 8, exact: 7, alternate: 0, missing: 1 },
			{ required: 8, exact: 7, alternate: 0, missing: 1 }
		]);
	});
});

(process.env.TEST_SCALE_CATALOG_PATH ? run : describe.skip)(
	'bounded Dashboard account reads',
	() => {
		const database = createDatabase(process.env.TEST_DATABASE_URL!);
		const auth = createLocalAuth(database.db, { demoMode: false });
		const accounts: string[] = [];
		afterAll(async () => {
			if (accounts.length)
				await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
					accounts
				]);
			await database.pool.end();
		});
		it('summarizes 50,000 actual-printing Inventory entries without transferring them, scopes decks and pending reviews, and rejects revoked actors', async () => {
			const { createDashboard } = await import('@spellbook/backend');

			const owner = (await auth.authenticate(
				'register',
				`summary_${crypto.randomUUID().slice(0, 8)}`,
				'summary-account-test-password'
			))!;
			const other = (await auth.authenticate(
				'register',
				`other_${crypto.randomUUID().slice(0, 8)}`,
				'summary-account-test-password'
			))!;
			accounts.push(owner.user.accountId, other.user.accountId);
			const { records, entries } = await seedAccountScaleInventory(
				database.pool,
				owner.user.accountId,
				process.env.TEST_SCALE_CATALOG_PATH!
			);
			const deckId = crypto.randomUUID();
			const otherDeckId = crypto.randomUUID();
			await database.pool.query(
				"INSERT INTO decks(id,account_id,game,name) VALUES($1,$2,'mtg','Owner deck'),($3,$4,'mtg','Foreign deck')",
				[deckId, owner.user.accountId, otherDeckId, other.user.accountId]
			);
			const card = records[0].document;
			await database.pool.query(
				"INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity) VALUES($1,$2,$3,'mtg',$4,$5,$6,$7,$8,8)",
				[
					crypto.randomUUID(),
					deckId,
					owner.user.accountId,
					card.id,
					card.oracle_id,
					card.name,
					card.set_code,
					card.image_uri
				]
			);
			await database.pool.query(
				"INSERT INTO scan_sessions(id,account_id,game,status) VALUES($1,$2,'mtg','pending_review'),($3,$4,'mtg','pending_review')",
				[crypto.randomUUID(), owner.user.accountId, crypto.randomUUID(), other.user.accountId]
			);
			const dashboard = createDashboard(database.pool, auth);
			const summary = await dashboard.get(owner.user);
			expect(summary.totals).toEqual({
				total: 50000,
				names: new Set(records.map((r) => r.document.oracle_id)).size,
				printings: 10000,
				sets: new Set(records.map((r) => r.document.set_code)).size,
				foils: entries.filter((e) => e.finish === 'foil').length,
				decks: 1
			});
			expect(summary.recentEntries).toHaveLength(8);
			expect(summary.recentEntries.every((entry) => typeof entry.updatedAt === 'string')).toBe(
				true
			);
			const alternate = Math.min(
				3,
				entries.filter((e) => e.canonicalCardId === card.oracle_id).length - 5
			);
			expect(summary.decks).toEqual([
				{
					id: deckId,
					name: 'Owner deck',
					format: 'Commander',
					required: 8,
					exact: 5,
					alternate,
					missing: 3 - alternate
				}
			]);
			expect(summary.pendingScanReviews).toBe(1);
			expect(JSON.stringify(summary).length).toBeLessThan(30000);
			expect(await dashboard.get(other.user)).toMatchObject({
				totals: { total: 0 },
				recentEntries: [],
				pendingScanReviews: 1
			});
			await auth.revokeSession(owner.session.token);
			await expect(dashboard.get(owner.user)).rejects.toMatchObject({ kind: 'Unauthenticated' });
		}, 90000);
	}
);
