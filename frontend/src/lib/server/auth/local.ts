import { demoMode, acceptsDemoLogin } from './demo';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error, type RequestEvent } from '@sveltejs/kit';
import type { AuthUser } from '#lib/auth/types.ts';
import { DEFAULT_AVATAR_ID } from '#lib/profile/avatars.ts';
import { db } from '#lib/server/db/client.ts';
import { localCredentials, userProfiles } from '#lib/server/db/schema.ts';
import { createSession } from './session';
import { hashPassword, normalizeUsername, validPassword, verifyPassword } from './password';

export function sanitizeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(value))
		return '/';
	return value;
}

export function requireSameOrigin(
	event: Pick<RequestEvent, 'request' | 'url'>,
	allowMissing = false
) {
	const origin = event.request.headers.get('origin');
	if ((!origin && !allowMissing) || (origin && origin !== event.url.origin))
		error(403, 'Invalid request origin');
}

// Per-process protection also caps concurrent password derivations and memory use.
const attempts = new Map<string, { count: number; expires: number }>();
let activeDerivations = 0;
export function takeAuthAttempt(address: string, now = Date.now()): void {
	for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
	const entry = attempts.get(address);
	if (entry && entry.count >= 20) error(429, 'Too many attempts. Try again in 15 minutes.');
	if (!entry && attempts.size >= 10000) error(429, 'Too many attempts. Try again later.');
	attempts.set(address, {
		count: (entry?.count ?? 0) + 1,
		expires: entry?.expires ?? now + 15 * 60 * 1000
	});
}

export async function authenticate(
	mode: 'login' | 'register',
	usernameInput: unknown,
	password: unknown
): Promise<{ user: AuthUser; session: { token: string; expiresAt: Date } } | null> {
	const username = normalizeUsername(usernameInput);
	if (demoMode && (mode !== 'login' || username !== 'demo')) return null;
	if (!username || (!validPassword(password) && !acceptsDemoLogin(mode, username, password)))
		return null;
	if (activeDerivations >= 4) error(429, 'Authentication is busy. Try again shortly.');
	activeDerivations++;
	try {
		if (mode === 'register') {
			const passwordHash = await hashPassword(password);
			const accountId = randomUUID();
			try {
				await db.transaction(async (tx) => {
					await tx.insert(userProfiles).values({ accountId, username });
					await tx.insert(localCredentials).values({ accountId, username, passwordHash });
				});
			} catch (cause) {
				const databaseError = cause as { code?: string; cause?: { code?: string } };
				if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return null;
				throw cause;
			}
			const session = await createSession(accountId, passwordHash);
			return session
				? { user: { accountId, username, email: '', avatarId: DEFAULT_AVATAR_ID }, session }
				: null;
		}
		const [credential] = await db
			.select()
			.from(localCredentials)
			.where(eq(localCredentials.username, username))
			.limit(1);
		if (!(await verifyPassword(password, credential?.passwordHash ?? null)) || !credential)
			return null;
		const [user] = await db
			.select({
				accountId: userProfiles.accountId,
				username: userProfiles.username,
				email: userProfiles.email,
				avatarId: userProfiles.avatarId
			})
			.from(userProfiles)
			.where(eq(userProfiles.accountId, credential.accountId))
			.limit(1);
		if (!user) return null;
		const session = await createSession(user.accountId, credential.passwordHash);
		return session ? { user, session } : null;
	} finally {
		activeDerivations--;
	}
}
