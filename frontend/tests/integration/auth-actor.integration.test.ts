import { afterAll, describe, expect, it } from 'vitest';
import { hashSessionToken } from '@spellbook/backend/auth/session.ts';
import { createDatabase, createLocalAuth } from '@spellbook/backend';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('backend authenticated actors', () => {
	const database = createDatabase(process.env.TEST_DATABASE_URL!);
	const auth = createLocalAuth(database.db, { demoMode: false });
	const accounts: string[] = [];
	async function account(password = 'auth-actor-original-password') {
		const result = (await auth.authenticate(
			'register',
			`actor_${crypto.randomUUID().slice(0, 8)}`,
			password
		))!;
		accounts.push(result.user.accountId);
		return result;
	}
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
	it('derives identity from the session and rejects an expired actor', async () => {
		const original = await account();
		const other = await account();
		const accountId = original.user.accountId;
		original.user.accountId = other.user.accountId;
		expect((await auth.requireActor(original.user)).accountId).toBe(accountId);
		await database.pool.query(
			"UPDATE auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
			[hashSessionToken(original.session.token)]
		);
		await expect(auth.requireActor(original.user)).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		expect(await auth.inspectSession(original.session.token)).toBeNull();
		expect((await auth.requireActor(other.user)).accountId).toBe(other.user.accountId);
	});
	it('allows only one simultaneous password rotation from the old credential', async () => {
		const original = await account();
		const nextPasswords = ['auth-actor-next-password-one', 'auth-actor-next-password-two'];
		const results = await Promise.allSettled(
			nextPasswords.map((password) =>
				auth.changePassword(original.user, 'auth-actor-original-password', password)
			)
		);
		const winners = results.flatMap((result, index) =>
			result.status === 'fulfilled' && result.value
				? [{ session: result.value, password: nextPasswords[index] }]
				: []
		);
		expect(winners).toHaveLength(1);
		expect(await auth.validateSession(original.session.token)).toBeNull();
		expect(await auth.validateSession(winners[0].session.token)).not.toBeNull();
		const count = await database.pool.query(
			'SELECT count(*)::int AS count FROM auth_sessions WHERE account_id=$1',
			[original.user.accountId]
		);
		expect(count.rows[0].count).toBe(1);
		expect(
			await auth.authenticate('login', original.user.username, winners[0].password)
		).not.toBeNull();
	});
	it('rolls back the credential and revocations if replacement session issuance fails', async () => {
		const original = await account();
		expect(original.user.accountId).toMatch(/^[0-9a-f-]{36}$/);
		const name = `actor_rotation_fail_${crypto.randomUUID().replaceAll('-', '')}`;
		await database.pool.query(
			`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.account_id='${original.user.accountId}' THEN RAISE EXCEPTION 'test replacement failure'; END IF; RETURN NEW; END $$`
		);
		try {
			await database.pool.query(
				`CREATE TRIGGER "${name}" BEFORE INSERT ON auth_sessions FOR EACH ROW EXECUTE FUNCTION "${name}"()`
			);
			await expect(
				auth.changePassword(
					original.user,
					'auth-actor-original-password',
					'auth-actor-replacement-password'
				)
			).rejects.toThrow();
			expect(await auth.requireActor(original.user)).toEqual(original.user);
			const count = await database.pool.query(
				'SELECT count(*)::int AS count FROM auth_sessions WHERE account_id=$1',
				[original.user.accountId]
			);
			expect(count.rows[0].count).toBe(1);
		} finally {
			await database.pool.query(`DROP TRIGGER IF EXISTS "${name}" ON auth_sessions`);
			await database.pool.query(`DROP FUNCTION "${name}"()`);
		}
		expect(
			await auth.authenticate('login', original.user.username, 'auth-actor-original-password')
		).not.toBeNull();
		expect(
			await auth.authenticate('login', original.user.username, 'auth-actor-replacement-password')
		).toBeNull();
	});
});
