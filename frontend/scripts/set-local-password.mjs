import pg from 'pg';
import { hashPassword, normalizeUsername, validPassword } from '../src/lib/server/auth/password.ts';

const [accountId, inputUsername] = process.argv.slice(2);
const username = normalizeUsername(inputUsername);
if (!accountId || !username || !process.env.DATABASE_URL) {
	console.error(
		'Usage: node --env-file=../.env scripts/set-local-password.mjs ACCOUNT_ID USERNAME < password-file'
	);
	process.exit(1);
}
let password = '';
for await (const chunk of process.stdin) {
	password += chunk.toString();
	if (password.length > 130) throw new Error('Password is too long');
}
password = password.replace(/\r?\n$/, '');
if (!validPassword(password)) throw new Error('Password must contain 12 to 128 characters');
const passwordHash = await hashPassword(password);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
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
	console.log('Local credentials saved. Existing sessions revoked.');
} catch (error) {
	await client.query('ROLLBACK');
	throw error;
} finally {
	await client.end();
}
