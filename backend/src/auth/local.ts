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
	SessionInfo,
	AuthFailure
} from '@spellbook/contracts/auth.ts';
import type { Database, Transaction } from '../db/client.ts';
import { localCredentials, userProfiles, authSessions } from '../db/schema.ts';
import { hashPassword, normalizeUsername, validPassword, verifyPassword } from './password.ts';
import { createSessionStore, hashSessionToken } from './session.ts';

export class AuthError extends Error implements AuthFailure {
	readonly kind = 'RateLimited';
}
export class ActorError extends Error {
	readonly kind = 'Unauthenticated';
	constructor() {
		super('Authentication required');
	}
}
export function createLocalAuth(db: Database, config: { demoMode: boolean }) {
	const { createSession, revokeSession, inspectSession: readSession } = createSessionStore(db);
	const actors = new WeakMap<AuthUser, string>();
	function trust(user: AuthUser, token: string) {
		actors.set(user, token);
		return user;
	}
	async function inspectSession(token: string | undefined): Promise<SessionInfo | null> {
		const session = await readSession(token);
		return session && token ? { ...session, user: trust(session.user, token) } : null;
	}
	async function validateSession(token: string | undefined) {
		return (await inspectSession(token))?.user ?? null;
	}
	async function actorSession(actor: AuthUser): Promise<SessionInfo> {
		const session = await readSession(actors.get(actor));
		if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new ActorError();
		return { ...session, user: trust(session.user, actors.get(actor)!) };
	}
	async function requireActor(actor: AuthUser, transaction?: Transaction): Promise<AuthUser> {
		const token = actors.get(actor);
		const session = await readSession(token, transaction);
		if (!session) throw new ActorError();
		return trust(session.user, token!);
	}
	// Call only after the owning Profile lock. Logout waits for this live session fence.
	async function requireActorForWrite(
		actor: AuthUser,
		transaction: Transaction
	): Promise<AuthUser> {
		const token = actors.get(actor);
		if (!token) throw new ActorError();
		const [session] = await transaction
			.select({ expiresAt: authSessions.expiresAt })
			.from(authSessions)
			.where(eq(authSessions.tokenHash, hashSessionToken(token)))
			.for('share');
		if (!session || session.expiresAt.getTime() <= Date.now()) throw new ActorError();
		return requireActor(actor, transaction);
	}
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
							user: trust(
								{
									accountId,
									username,
									email: '',
									avatarId: DEFAULT_AVATAR_ID,
									artworkId
								},
								session.token
							),
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
			return session ? { user: trust(user, session.token), session } : null;
		});
	}

	async function changePassword(actor: AuthUser, currentPassword: string, newPassword: string) {
		const user = await requireActor(actor);
		if (demoMode || !currentPassword || currentPassword.length > 128 || !validPassword(newPassword))
			return null;
		return withPasswordDerivation(async () => {
			const [credential] = await db
				.select({ passwordHash: localCredentials.passwordHash })
				.from(localCredentials)
				.where(eq(localCredentials.accountId, user.accountId));
			if (!(await verifyPassword(currentPassword, credential?.passwordHash ?? null)) || !credential)
				return null;
			const passwordHash = await hashPassword(newPassword);
			return db.transaction(async (tx) => {
				const [profile] = await tx
					.select({ accountId: userProfiles.accountId })
					.from(userProfiles)
					.where(eq(userProfiles.accountId, user.accountId))
					.for('update');
				if (!profile) return null;
				await requireActor(actor, tx);
				const [current] = await tx
					.select({ passwordHash: localCredentials.passwordHash })
					.from(localCredentials)
					.where(eq(localCredentials.accountId, user.accountId));
				if (current?.passwordHash !== credential.passwordHash) return null;
				await tx
					.update(localCredentials)
					.set({ passwordHash, updatedAt: new Date() })
					.where(eq(localCredentials.accountId, user.accountId));
				await tx.delete(authSessions).where(eq(authSessions.accountId, user.accountId));
				const session = await createSession(user.accountId, passwordHash, tx);
				if (!session) throw new Error('Unable to issue the replacement session');
				return session;
			});
		});
	}

	return {
		authenticate,
		createSession,
		validateSession,
		revokeSession,
		takeAuthAttempt,
		withPasswordDerivation,
		inspectSession,
		requireActor,
		requireActorForWrite,
		changePassword,
		actorSession
	} satisfies LocalAuthApplication & {
		createSession: typeof createSession;
		takeAuthAttempt: typeof takeAuthAttempt;
		withPasswordDerivation: typeof withPasswordDerivation;
		inspectSession: typeof inspectSession;
		requireActor: typeof requireActor;
		requireActorForWrite: typeof requireActorForWrite;
		changePassword: typeof changePassword;
		actorSession: typeof actorSession;
	};
}
