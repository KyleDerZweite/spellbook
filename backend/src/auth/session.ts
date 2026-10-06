import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { Database, Transaction } from '../db/client.ts';
import { authSessions, localCredentials, userProfiles } from '../db/schema.ts';

export const SESSION_COOKIE = 'spellbook_session';
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function createSessionStore(db: Database) {
	type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

	async function createSession(
		accountId: string,
		expectedPasswordHash: string,
		transaction?: Transaction
	) {
		const issue = async (tx: Transaction) => {
			// Password resets acquire this same lock before replacing credentials and revoking sessions.
			const [profile] = await tx
				.select({ accountId: userProfiles.accountId })
				.from(userProfiles)
				.where(eq(userProfiles.accountId, accountId))
				.for('update');
			if (!profile) return null;
			const [credential] = await tx
				.select({ passwordHash: localCredentials.passwordHash })
				.from(localCredentials)
				.where(eq(localCredentials.accountId, accountId));
			if (credential?.passwordHash !== expectedPasswordHash) return null;
			const token = randomBytes(32).toString('base64url');
			const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
			await tx
				.insert(authSessions)
				.values({ tokenHash: hashSessionToken(token), accountId, expiresAt });
			return { token, expiresAt: expiresAt.toISOString() };
		};
		return transaction ? issue(transaction) : db.transaction(issue);
	}

	async function inspectSession(token: string | undefined, executor: Database | Transaction = db) {
		if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
		const [user] = await executor
			.select({
				accountId: userProfiles.accountId,
				username: userProfiles.username,
				email: userProfiles.email,
				avatarId: userProfiles.avatarId,
				artworkId: userProfiles.artworkId,
				expiresAt: authSessions.expiresAt
			})
			.from(authSessions)
			.innerJoin(userProfiles, eq(authSessions.accountId, userProfiles.accountId))
			.where(
				and(
					eq(authSessions.tokenHash, hashSessionToken(token)),
					gt(authSessions.expiresAt, new Date())
				)
			)
			.limit(1);
		if (!user) return null;
		const { expiresAt, ...profile } = user;
		return { user: profile, expiresAt: expiresAt.toISOString() };
	}

	async function validateSession(token: string | undefined) {
		return (await inspectSession(token))?.user ?? null;
	}

	async function revokeSession(token: string | undefined): Promise<void> {
		if (token)
			await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
	}

	return { createSession, validateSession, revokeSession, inspectSession };
}
