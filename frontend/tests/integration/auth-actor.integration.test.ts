import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, createLocalAuth } from '@spellbook/backend';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('backend authenticated actors', () => {
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
	it('trusts only backend session-produced actors and revokes authority when passwords rotate', async () => {
		const password = 'auth-actor-original-password';
		const account = (await auth.authenticate(
			'register',
			`actor_${crypto.randomUUID().slice(0, 8)}`,
			password
		))!;
		accounts.push(account.user.accountId);
		expect(await auth.requireActor(account.user)).toEqual(account.user);
		await expect(auth.requireActor({ ...account.user })).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		const inspected = (await auth.inspectSession(account.session.token))!;
		expect(inspected).toEqual({ user: account.user, expiresAt: account.session.expiresAt });
		expect(await auth.requireActor(inspected.user)).toEqual(account.user);
		expect(
			await auth.changePassword(account.user, 'wrong-password', 'auth-actor-replacement-password')
		).toBeNull();
		expect(await auth.requireActor(account.user)).toEqual(account.user);
		const replacement = (await auth.changePassword(
			account.user,
			password,
			'auth-actor-replacement-password'
		))!;
		await expect(auth.requireActor(account.user)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		expect(await auth.validateSession(account.session.token)).toBeNull();
		const next = (await auth.validateSession(replacement.token))!;
		expect(await auth.requireActor(next)).toEqual(account.user);
		await auth.revokeSession(replacement.token);
		await expect(auth.requireActor(next)).rejects.toMatchObject({ kind: 'Unauthenticated' });
	});
});
