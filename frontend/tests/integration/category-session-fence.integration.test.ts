import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createCategories, createDatabase, createLocalAuth } from '@spellbook/backend';
import type { SaveDefinitionInput } from '@spellbook/contracts/category-library.ts';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('Category authority at the PostgreSQL session fence', () => {
	let database: ReturnType<typeof createDatabase>;
	let auth: ReturnType<typeof createLocalAuth>;
	let categories: ReturnType<typeof createCategories>;
	const accounts: string[] = [];
	beforeAll(() => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		auth = createLocalAuth(database.db, { demoMode: false });
		categories = createCategories(database.db, auth);
	});
	afterAll(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1::text[])', [
			accounts
		]);
		await database.pool.end();
	});
	async function register() {
		const account = await auth.authenticate(
			'register',
			'fence21_' + randomUUID().slice(0, 8),
			'category-session-fence-password'
		);
		if (!account) throw Error('Registration failed');
		accounts.push(account.user.accountId);
		return account;
	}
	const input = (): SaveDefinitionInput => ({
		requestId: randomUUID(),
		originId: null,
		expectedLibraryRevision: '0',
		scope: 'entry',
		name: 'Fence category',
		meaning: 'Artifacts',
		priority: 0,
		displayOrder: 0,
		roles: ['main'],
		rule: { op: 'type', value: 'Artifact' },
		confirmRetainedRule: false
	});
	async function waitForLock(fragment: string) {
		const until = Date.now() + 1500;
		while (Date.now() < until) {
			const result = await database.pool.query(
				"SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND strpos(query,$1)>0",
				[fragment]
			);
			if (result.rowCount) return;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw Error('Expected blocked statement was not observed');
	}
	it('lets logout complete before blocked authority validation and rolls back the pending mutation', async () => {
		const account = await register(),
			request = input(),
			held = await database.pool.connect();
		await held.query('BEGIN');
		await held.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			account.user.accountId
		]);
		const write = categories.saveDefinition(account.user, request).then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		try {
			await waitForLock('FOR UPDATE');
			await auth.revokeSession(account.session.token);
			await held.query('COMMIT');
			const result = await write;
			expect('error' in result && result.error.kind).toBe('Unauthenticated');
			expect(
				(
					await database.pool.query(
						'SELECT count(*) FROM category_definition_origins WHERE account_id=$1',
						[account.user.accountId]
					)
				).rows[0].count
			).toBe('0');
		} finally {
			await held.query('ROLLBACK');
			held.release();
		}
	});
	it('holds logout behind already validated category work until the original receipt commits', async () => {
		const account = await register(),
			request = input(),
			held = await database.pool.connect();
		await held.query('BEGIN');
		await held.query('LOCK TABLE category_definition_origins IN ACCESS EXCLUSIVE MODE');
		const write = categories.saveDefinition(account.user, request);
		let revoke: Promise<void> | undefined;
		try {
			await waitForLock('category_definition_origins');
			revoke = auth.revokeSession(account.session.token);
			await waitForLock('delete from "auth_sessions"');
			await held.query('COMMIT');
			const result = await write;
			await revoke;
			expect(result.changed).toBe(true);
			expect(
				(
					await database.pool.query(
						'SELECT acknowledgement FROM category_mutation_requests WHERE account_id=$1 AND request_id=$2',
						[account.user.accountId, request.requestId]
					)
				).rows[0].acknowledgement
			).toEqual(result);
			await expect(categories.getLibrary(account.user)).rejects.toMatchObject({
				kind: 'Unauthenticated'
			});
		} finally {
			await held.query('ROLLBACK');
			held.release();
			await revoke;
		}
	});
	it('checks live expiry after waiting for the Profile lock', async () => {
		const account = await register(),
			held = await database.pool.connect();
		await held.query('BEGIN');
		await held.query('SELECT account_id FROM user_profiles WHERE account_id=$1 FOR UPDATE', [
			account.user.accountId
		]);
		const write = categories.saveDefinition(account.user, input()).then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		try {
			await waitForLock('FOR UPDATE');
			await database.pool.query(
				"UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE account_id=$1",
				[account.user.accountId]
			);
			await held.query('COMMIT');
			const result = await write;
			expect('error' in result && result.error.kind).toBe('Unauthenticated');
		} finally {
			await held.query('ROLLBACK');
			held.release();
		}
	});
	it('enforces immutable reusable scope and published version snapshots in PostgreSQL', async () => {
		const account = await register(),
			result = await categories.saveDefinition(account.user, input());
		await expect(
			database.pool.query("UPDATE category_definition_origins SET scope='deck' WHERE id=$1", [
				result.originId
			])
		).rejects.toMatchObject({ code: '23514' });
		await expect(
			database.pool.query(
				"UPDATE category_definition_versions SET definition=jsonb_set(definition,'{name}','\"Altered\"') WHERE id=$1",
				[result.versionId]
			)
		).rejects.toMatchObject({ code: '23514' });
		expect((await categories.getDefinition(account.user, result.originId)).current.name).toBe(
			'Fence category'
		);
	});
});
