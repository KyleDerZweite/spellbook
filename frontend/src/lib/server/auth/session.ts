import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import type { AuthUser } from '#lib/auth/types.ts';
import { db } from '#lib/server/db/client.ts';
import { authSessions, localCredentials, userProfiles } from '#lib/server/db/schema.ts';

export const SESSION_COOKIE = 'spellbook_session';
export const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createSession(
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
		return { token, expiresAt };
	};
	return transaction ? issue(transaction) : db.transaction(issue);
}

export async function validateSession(token: string | undefined): Promise<AuthUser | null> {
	if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
	const [user] = await db
		.select({
			accountId: userProfiles.accountId,
			username: userProfiles.username,
			email: userProfiles.email,
			avatarId: userProfiles.avatarId,
			artworkId: userProfiles.artworkId
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
	return user ?? null;
}

export async function revokeSession(token: string | undefined): Promise<void> {
	if (token)
		await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
}

export function writeSessionCookie(cookies: Cookies, token: string, url: URL): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: SESSION_LIFETIME_SECONDS
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getBearerToken(request: Request): string | undefined {
	return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
}
