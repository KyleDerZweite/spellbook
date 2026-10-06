import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, createLocalAuth, createSavedState } from '@spellbook/backend';
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL !== process.env.DATABASE_URL)
	throw Error('SavedState tests require matching disposable database URLs');
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('committed SavedState account invalidation', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const sync = createSavedState(process.env.TEST_DATABASE_URL!, auth);
	const accounts: string[] = [];
	afterAll(async () => {
		await sync.close();
		if (accounts.length)
			await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
				accounts
			]);
		await database.pool.end();
	});
	it('subscribes before reset and delivers only committed account topics', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const stream = await sync.subscribe(a.user);
		expect(await stream.next()).toEqual({ event: 'reset', data: {} });
		const tx = await database.pool.connect();
		try {
			await tx.query('BEGIN');
			await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
				a.user.accountId,
				'rollback@example.test'
			]);
			await tx.query('ROLLBACK');
			await tx.query('BEGIN');
			await tx.query('UPDATE user_profiles SET email=$2 WHERE account_id=$1', [
				a.user.accountId,
				'commit@example.test'
			]);
			await tx.query('COMMIT');
			expect(await stream.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		} finally {
			tx.release();
			stream.close();
		}
	}, 10000);
	it('coalesces protected topics and discards them on direct session revocation', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const sub = await sync.subscribe(a.user);
		await sub.next();
		for (let index = 0; index < 100; index++)
			await database.pool.query('SELECT pg_notify($1,$2)', [
				'spellbook_saved_state',
				JSON.stringify({
					accountId: a.user.accountId,
					topic: ['profile', 'inventory', 'decks', 'scan'][index % 4]
				})
			]);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(sync.diagnostics().queuedEvents).toBe(1);
		expect(await sub.next()).toEqual({
			event: 'invalidate',
			data: { topics: ['profile', 'inventory', 'decks', 'scan'] }
		});
		await database.pool.query('UPDATE user_profiles SET avatar_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'dragon'
		]);
		await auth.revokeSession(a.session.token);
		expect(await sub.next()).toEqual({ event: 'auth-expired', data: {} });
		expect(sync.diagnostics().subscribers).toBe(0);
		expect(await sub.next()).toBeNull();
	});
	it('records a committed change between subscription registration and first reset delivery', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		await expect(sync.subscribe({ ...a.user })).rejects.toMatchObject({ kind: 'Unauthenticated' });
		const sub = await sync.subscribe(a.user);
		try {
			await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
				a.user.accountId,
				'ember'
			]);
			expect(await sub.next()).toEqual({ event: 'reset', data: {} });
			expect(await sub.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		} finally {
			sub.close();
		}
	});
	it('bounds undrained invalidations and disposes a slow subscription without stalling another client', async () => {
		const a = (await auth.authenticate(
			'register',
			`sync_${crypto.randomUUID().slice(0, 8)}`,
			'saved-state-test-password'
		))!;
		accounts.push(a.user.accountId);
		const slow = await sync.subscribe(a.user),
			healthy = await sync.subscribe(a.user);
		await slow.next();
		await healthy.next();
		await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'tide'
		]);
		expect(await healthy.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		expect(sync.diagnostics().queuedEvents).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 30500));
		expect(await slow.next()).toBeNull();
		expect(sync.diagnostics().subscribers).toBe(1);
		await database.pool.query('UPDATE user_profiles SET artwork_id=$2 WHERE account_id=$1', [
			a.user.accountId,
			'astral'
		]);
		expect(await healthy.next()).toEqual({ event: 'invalidate', data: { topics: ['profile'] } });
		healthy.close();
	}, 40000);
});
