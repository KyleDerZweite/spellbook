import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../../src/lib/server/db/client';
import { authSessions, localCredentials, userProfiles } from '../../src/lib/server/db/schema';
import { authenticate } from '../../src/lib/server/auth/local';
import {
	createSession,
	hashSessionToken,
	revokeSession,
	validateSession
} from '../../src/lib/server/auth/session';
import { POST as login } from '../../src/routes/api/auth/login/+server';
import { POST as logout } from '../../src/routes/api/auth/logout/+server';
import { hashPassword } from '../../src/lib/server/auth/password';
import { requireMobileAuth } from '../../src/lib/server/mobile/auth';

const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('local accounts and persisted sessions', () => {
	const accountIds: string[] = [];
	afterAll(async () => {
		if (accountIds.length)
			await db.delete(userProfiles).where(inArray(userProfiles.accountId, accountIds));
		await pool.end();
	});
	it('registers atomically, authenticates normalized usernames and rejects duplicates', async () => {
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const password = 'correct horse battery';
		const user = await authenticate('register', username, password);
		expect(user).not.toBeNull();
		accountIds.push(user!.user.accountId);
		expect((await authenticate('login', ` ${username.toUpperCase()} `, password))?.user).toEqual(
			user!.user
		);
		expect(await authenticate('login', username, 'incorrect horse battery')).toBeNull();
		expect(await authenticate('register', username, password)).toBeNull();
		const profiles = await db
			.select()
			.from(userProfiles)
			.where(eq(userProfiles.username, username));
		expect(profiles).toHaveLength(1);
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user!.user.accountId));
		expect(credential.passwordHash).not.toContain(password);
	});
	it('stores only token hashes and enforces expiry and revocation', async () => {
		const user = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		accountIds.push(user!.user.accountId);
		const session = user!.session;
		const [stored] = await db
			.select()
			.from(authSessions)
			.where(eq(authSessions.accountId, user!.user.accountId));
		expect(stored.tokenHash).toBe(hashSessionToken(session.token));
		expect(stored.tokenHash).not.toBe(session.token);
		expect(await validateSession(session.token)).toEqual(user!.user);
		await db
			.update(authSessions)
			.set({ expiresAt: new Date(0) })
			.where(eq(authSessions.tokenHash, stored.tokenHash));
		expect(await validateSession(session.token)).toBeNull();
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, user!.user.accountId));
		const second = (await createSession(user!.user.accountId, credential.passwordHash))!;
		await revokeSession(second.token);
		expect(await validateSession(second.token)).toBeNull();
	});
	it('rejects issuance from a password verified before an operator reset', async () => {
		const authenticated = await authenticate(
			'register',
			`mage_${crypto.randomUUID().slice(0, 12)}`,
			'correct horse battery'
		);
		const accountId = authenticated!.user.accountId;
		accountIds.push(accountId);
		const [old] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.accountId, accountId));
		const replacement = await hashPassword('replacement secret phrase');
		await db.transaction(async (tx) => {
			await tx
				.select()
				.from(userProfiles)
				.where(eq(userProfiles.accountId, accountId))
				.for('update');
			await tx
				.update(localCredentials)
				.set({ passwordHash: replacement })
				.where(eq(localCredentials.accountId, accountId));
			await tx.delete(authSessions).where(eq(authSessions.accountId, accountId));
		});
		expect(await createSession(accountId, old.passwordHash)).toBeNull();
		expect(await validateSession(authenticated!.session.token)).toBeNull();
		expect(await createSession(accountId, replacement)).not.toBeNull();
	});
	it('enrolls and resets an existing account through the operator command', async () => {
		const accountId = `legacy-${crypto.randomUUID()}`;
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		accountIds.push(accountId);
		await db
			.insert(userProfiles)
			.values({ accountId, username: 'Old identity', email: 'legacy@example.test' });
		const setPassword = async (password: string) => {
			const command = spawn(
				process.execPath,
				['scripts/set-local-password.mjs', accountId, username],
				{
					env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
					stdio: ['pipe', 'pipe', 'pipe']
				}
			);
			let output = '';
			command.stdout.on('data', (chunk) => {
				output += chunk.toString();
			});
			command.stderr.on('data', (chunk) => {
				output += chunk.toString();
			});
			command.stdin.end(password + '\n');
			const code = await new Promise((resolve, reject) => {
				command.on('close', resolve);
				command.on('error', reject);
			});
			expect(output).not.toContain(password);
			expect(code, output).toBe(0);
		};
		await setPassword('first local password');
		const first = await authenticate('login', username, 'first local password');
		expect(first!.user).toMatchObject({ accountId, email: 'legacy@example.test' });
		await setPassword('replacement local password');
		expect(await validateSession(first!.session.token)).toBeNull();
		expect(await authenticate('login', username, 'first local password')).toBeNull();
		expect(
			(await authenticate('login', username, 'replacement local password'))!.user.accountId
		).toBe(accountId);
	});
	it('issues a mobile bearer session and revokes it via the API', async () => {
		const username = `mage_${crypto.randomUUID().slice(0, 12)}`;
		const password = 'correct horse battery';
		const user = await authenticate('register', username, password);
		accountIds.push(user!.user.accountId);
		const url = new URL('https://spellbook.test/api/auth/login');
		const response = await login({
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ username, password })
			}),
			getClientAddress: () => crypto.randomUUID()
		} as never);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const body = await response.json();
		expect(body.user.accountId).toBe(user!.user.accountId);
		const event = {
			url,
			request: new Request(url, {
				method: 'POST',
				headers: { authorization: `Bearer ${body.token}` }
			}),
			locals: {}
		};
		expect((await requireMobileAuth(event as never)).user).toEqual(user!.user);
		expect((await logout(event as never)).status).toBe(204);
		await expect(requireMobileAuth(event as never)).rejects.toMatchObject({ status: 401 });
	});
});
