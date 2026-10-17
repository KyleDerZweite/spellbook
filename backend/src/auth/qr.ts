import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type {
	AuthUser,
	QrAuthApplication,
	QrCreated,
	QrRedemption,
	QrRequestInfo,
	QrRequester
} from '@spellbook/contracts/auth.ts';
import { validQrCredential } from '@spellbook/contracts/auth.ts';
import type { Database, Transaction } from '../db/client.ts';
import { authSessions, localCredentials, qrAuthorizations, userProfiles } from '../db/schema.ts';
import { createSessionStore, hashSessionToken } from './session.ts';
export { validQrCredential } from '@spellbook/contracts/auth.ts';

export class QrAuthError extends Error {
	constructor(
		readonly kind: 'ValidationFailed' | 'NotFound' | 'Conflict' | 'Unauthenticated' | 'RateLimited',
		message: string
	) {
		super(message);
	}
}
const lifetimeMs = 5 * 60 * 1000;

export function createQrAttemptLimiter(limit: number, windowMs: number, capacity = 10000) {
	const attempts = new Map<string, { count: number; expires: number }>();
	return (key: string, now = Date.now()) => {
		for (const [address, entry] of attempts) if (entry.expires <= now) attempts.delete(address);
		const entry = attempts.get(key);
		if ((entry && entry.count >= limit) || (!entry && attempts.size >= capacity))
			throw new QrAuthError('RateLimited', 'Too many QR requests. Try again later.');
		attempts.set(key, {
			count: (entry?.count ?? 0) + 1,
			expires: entry?.expires ?? now + windowMs
		});
	};
}

type Challenge = typeof qrAuthorizations.$inferSelect;
export function createQrAuth(
	db: Database,
	authority: {
		requireActor(actor: AuthUser): Promise<AuthUser>;
		sessionHash(actor: AuthUser): string | undefined;
	}
): QrAuthApplication {
	const creationAttempt = createQrAttemptLimiter(20, 15 * 60 * 1000);
	const decisionAttempt = createQrAttemptLimiter(60, 15 * 60 * 1000);
	const pollAttempt = createQrAttemptLimiter(600, 15 * 60 * 1000);
	const { createSession } = createSessionStore(db);
	function codeHash(code: string) {
		if (!validQrCredential(code)) throw new QrAuthError('ValidationFailed', 'Invalid QR code');
		return hashSessionToken(code);
	}
	function info(code: string, row: Challenge): QrRequestInfo {
		return {
			code,
			kind: row.kind,
			status:
				row.status === 'consumed' || row.status === 'denied'
					? row.status
					: row.expiresAt.getTime() <= Date.now()
						? 'expired'
						: row.status,
			expiresAt: row.expiresAt.toISOString()
		};
	}
	async function read(code: string, executor: Database | Transaction = db, lock = false) {
		const query = executor
			.select()
			.from(qrAuthorizations)
			.where(eq(qrAuthorizations.codeHash, codeHash(code)));
		const [row] = await (lock ? query.for('update') : query);
		if (!row) throw new QrAuthError('NotFound', 'QR request not found. Start a new request.');
		return row;
	}
	async function lockProfile(tx: Transaction, accountId: string) {
		const [profile] = await tx
			.select({ accountId: userProfiles.accountId })
			.from(userProfiles)
			.where(eq(userProfiles.accountId, accountId))
			.for('update');
		if (!profile) throw new QrAuthError('Unauthenticated', 'Authentication required');
	}
	// Profile -> challenge -> original approver session. Logout must wait for this share lock.
	async function liveSession(tx: Transaction, hash: string, accountId: string) {
		const [session] = await tx
			.select()
			.from(authSessions)
			.where(eq(authSessions.tokenHash, hash))
			.for('share');
		return session?.accountId === accountId && session.expiresAt.getTime() > Date.now();
	}
	function verifyRequester(row: Challenge, requester: QrRequester) {
		if (row.kind === 'browser' && requester.requesterSecret !== undefined)
			throw new QrAuthError(
				'ValidationFailed',
				'Browser credentials must use the requester cookie'
			);
		const secret = row.kind === 'browser' ? requester.browserSecret : requester.requesterSecret;
		if (!validQrCredential(secret) || hashSessionToken(secret) !== row.secretHash)
			throw new QrAuthError('Unauthenticated', 'Invalid requester credentials');
		if (row.kind === 'browser' && requester.browserAuthenticated)
			throw new QrAuthError('Conflict', 'This browser is already signed in.');
	}
	return {
		async create(kind, address): Promise<QrCreated> {
			creationAttempt(address);
			if (kind !== 'browser' && kind !== 'device')
				throw new QrAuthError('ValidationFailed', 'Invalid QR request kind');
			// Retain recent terminal results for retries. Cleanup is indexed, bounded and skips busy rows.
			await db.execute(sql`delete from ${qrAuthorizations} where ${qrAuthorizations.codeHash} in (
				select code_hash from ${qrAuthorizations} where expires_at < now() - interval '1 day'
				order by expires_at limit 100 for update skip locked
			)`);
			const code = randomBytes(32).toString('base64url');
			const requesterSecret = randomBytes(32).toString('base64url');
			const expiresAt = new Date(Date.now() + lifetimeMs);
			await db.insert(qrAuthorizations).values({
				codeHash: hashSessionToken(code),
				secretHash: hashSessionToken(requesterSecret),
				kind,
				expiresAt
			});
			return {
				code,
				kind,
				requesterSecret,
				expiresAt: expiresAt.toISOString(),
				interval: 3
			};
		},
		async inspect(actor, code, address) {
			pollAttempt(address);
			await authority.requireActor(actor);
			return info(code, await read(code));
		},
		async decide(actor, code, decision, address) {
			decisionAttempt(address);
			if (decision !== 'approve' && decision !== 'deny')
				throw new QrAuthError('ValidationFailed', 'Invalid QR decision');
			const user = await authority.requireActor(actor);
			const hash = authority.sessionHash(actor);
			if (!hash) throw new QrAuthError('Unauthenticated', 'Authentication required');
			return db.transaction(async (tx) => {
				await lockProfile(tx, user.accountId);
				const row = await read(code, tx, true);
				if (!(await liveSession(tx, hash, user.accountId)))
					throw new QrAuthError('Unauthenticated', 'Authentication required');
				const status = decision === 'approve' ? 'approved' : 'denied';
				if (row.status !== 'pending') {
					if (
						row.status !== status ||
						row.approverSessionHash !== hash ||
						row.approverAccountId !== user.accountId
					)
						throw new QrAuthError('Conflict', 'This QR request already has a decision.');
					return info(code, row);
				}
				if (row.expiresAt.getTime() <= Date.now()) return info(code, row);
				const [updated] = await tx
					.update(qrAuthorizations)
					.set({
						status,
						approverAccountId: user.accountId,
						approverSessionHash: hash
					})
					.where(eq(qrAuthorizations.codeHash, row.codeHash))
					.returning();
				return info(code, updated);
			});
		},
		async redeem(code, requester, address): Promise<QrRedemption> {
			pollAttempt(address);
			const initial = await read(code);
			verifyRequester(initial, requester);
			const status = info(code, initial).status;
			if (status !== 'approved') return { kind: initial.kind, status };
			return db.transaction(async (tx) => {
				await lockProfile(tx, initial.approverAccountId!);
				const row = await read(code, tx, true);
				verifyRequester(row, requester);
				const current = info(code, row).status;
				if (current !== 'approved') return { kind: row.kind, status: current };
				const live = await liveSession(tx, row.approverSessionHash!, row.approverAccountId!);
				// Recheck after every lock wait, including the session share lock.
				if (!live || row.expiresAt.getTime() <= Date.now()) {
					await tx
						.update(qrAuthorizations)
						.set({ expiresAt: new Date() })
						.where(eq(qrAuthorizations.codeHash, row.codeHash));
					return { kind: row.kind, status: 'expired' };
				}
				const [credential] = await tx
					.select()
					.from(localCredentials)
					.where(eq(localCredentials.accountId, row.approverAccountId!));
				if (!credential) throw new QrAuthError('Unauthenticated', 'Authentication required');
				const session = await createSession(row.approverAccountId!, credential.passwordHash, tx);
				if (!session) throw new QrAuthError('Unauthenticated', 'Authentication required');
				await tx
					.update(qrAuthorizations)
					.set({ status: 'consumed' })
					.where(eq(qrAuthorizations.codeHash, row.codeHash));
				return { kind: row.kind, status: 'authenticated', session };
			});
		}
	};
}
