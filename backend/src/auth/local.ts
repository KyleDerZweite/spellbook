import {
	DEFAULT_ARTWORK_ID,
	DEFAULT_AVATAR_ID,
	isProfileArtworkId
} from '@spellbook/contracts/profile.ts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type {
	Authenticated,
	AuthUser,
	LocalAuthApplication,
	AuthFailure
} from '@spellbook/contracts/auth.ts';
import type { Database } from '../db/client.ts';
import { localCredentials, userProfiles } from '../db/schema.ts';
import { hashPassword, normalizeUsername, validPassword, verifyPassword } from './password.ts';
import { createSessionStore } from './session.ts';

export class AuthError extends Error implements AuthFailure {
	readonly kind = 'RateLimited';
}
export function createLocalAuth(db: Database, config: { demoMode: boolean }) {
	const { createSession, validateSession, revokeSession } = createSessionStore(db);
	const demoMode = config.demoMode;
	function acceptsDemoLogin(
		mode: 'login' | 'register',
		username: string | null,
		password: unknown
	): password is string {
		return demoMode && mode === 'login' && username === 'demo' && password === 'demo';
	}
	// Per-process protection also caps concurrent password derivations and memory use.
	const attempts = new Map<string, { count: number; expires: number }>();
	let activeDerivations = 0;
	function takeAuthAttempt(address: string, now = Date.now()): void {
		for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
		const entry = attempts.get(address);
		if (entry && entry.count >= 20)
			throw new AuthError('Too many attempts. Try again in 15 minutes.');
		if (!entry && attempts.size >= 10000)
			throw new AuthError('Too many attempts. Try again later.');
		attempts.set(address, {
			count: (entry?.count ?? 0) + 1,
			expires: entry?.expires ?? now + 15 * 60 * 1000
		});
	}

	async function withPasswordDerivation<T>(operation: () => Promise<T>): Promise<T> {
		if (activeDerivations >= 4) throw new AuthError('Authentication is busy. Try again shortly.');
		activeDerivations++;
		try {
			return await operation();
		} finally {
			activeDerivations--;
		}
	}

	async function authenticate(
		mode: 'login' | 'register',
		usernameInput: unknown,
		password: unknown,
		preferences: { artworkId?: unknown } = {}
	): Promise<Authenticated | null> {
		const artworkInput = 'artworkId' in preferences ? preferences.artworkId : DEFAULT_ARTWORK_ID;
		if (mode === 'register' && !isProfileArtworkId(artworkInput)) return null;
		const artworkId = isProfileArtworkId(artworkInput) ? artworkInput : DEFAULT_ARTWORK_ID;
		const username = normalizeUsername(usernameInput);
		if (demoMode && (mode !== 'login' || username !== 'demo')) return null;
		if (!username || (!validPassword(password) && !acceptsDemoLogin(mode, username, password)))
			return null;
		return withPasswordDerivation(async () => {
			if (mode === 'register') {
				const passwordHash = await hashPassword(password);
				const accountId = randomUUID();
				try {
					await db.transaction(async (tx) => {
						await tx.insert(userProfiles).values({ accountId, username, artworkId });
						await tx.insert(localCredentials).values({ accountId, username, passwordHash });
					});
				} catch (cause) {
					const databaseError = cause as {
						code?: string;
						cause?: { code?: string };
					};
					if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return null;
					throw cause;
				}
				const session = await createSession(accountId, passwordHash);
				return session
					? {
							user: {
								accountId,
								username,
								email: '',
								avatarId: DEFAULT_AVATAR_ID,
								artworkId
							},
							session
						}
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
					avatarId: userProfiles.avatarId,
					artworkId: userProfiles.artworkId
				})
				.from(userProfiles)
				.where(eq(userProfiles.accountId, credential.accountId))
				.limit(1);
			if (!user) return null;
			const session = await createSession(user.accountId, credential.passwordHash);
			return session ? { user, session } : null;
		});
	}

	return {
		authenticate,
		createSession,
		validateSession,
		revokeSession,
		takeAuthAttempt,
		withPasswordDerivation
	} satisfies LocalAuthApplication & {
		createSession: typeof createSession;
		takeAuthAttempt: typeof takeAuthAttempt;
		withPasswordDerivation: typeof withPasswordDerivation;
	};
}
