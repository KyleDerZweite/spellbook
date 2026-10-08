import pg from 'pg';
import { hashPassword, normalizeUsername, validPassword } from '../auth/password.ts';

export { normalizeUsername, validPassword };

/** Password recovery targets the operator's authorized DATABASE_URL, including production. */
export async function setLocalPassword(
	databaseUrl: string,
	{
		accountId,
		username: inputUsername,
		password
	}: { accountId: string; username: string; password: string }
) {
	const username = normalizeUsername(inputUsername);
	if (!databaseUrl || !accountId || !username) throw new Error('Invalid local credential input');
	if (!validPassword(password)) throw new Error('Password must contain 12 to 128 characters');
	const passwordHash = await hashPassword(password);
	const pool = new pg.Pool({ connectionString: databaseUrl });
	let client: pg.PoolClient | undefined;
	try {
		client = await pool.connect();
		await client.query('BEGIN');
		const profile = await client.query(
			'SELECT account_id FROM user_profiles WHERE account_id = $1 FOR UPDATE',
			[accountId]
		);
		if (profile.rowCount !== 1) throw new Error('Account does not exist');
		await client.query(
			`INSERT INTO local_credentials (account_id, username, password_hash)
   VALUES ($1, $2, $3) ON CONFLICT (account_id) DO UPDATE
   SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, updated_at = now()`,
			[accountId, username, passwordHash]
		);
		await client.query('UPDATE user_profiles SET username = $2 WHERE account_id = $1', [
			accountId,
			username
		]);
		await client.query('DELETE FROM auth_sessions WHERE account_id = $1', [accountId]);
		await client.query('COMMIT');
		return { message: 'Local credentials saved. Existing sessions revoked.' };
	} catch (error) {
		if (client) await client.query('ROLLBACK').catch(() => {});
		throw new Error(
			error instanceof Error && error.message === 'Account does not exist'
				? error.message
				: 'Local credential update failed; transaction rolled back.'
		);
	} finally {
		client?.release();
		await pool.end();
	}
}
