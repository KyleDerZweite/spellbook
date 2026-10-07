import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { scanSessions, userProfiles } from '../db/schema.ts';
import { ScanError } from './validation.ts';
export type ScanAuth = Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>;
export async function authorizeScan(tx: Transaction, actor: AuthUser, auth: ScanAuth) {
	const user = await auth.requireActor(actor);
	await tx
		.select({ id: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, user.accountId))
		.for('update');
	return auth.requireActor(actor, tx);
}
export async function lockScanSession(tx: Transaction, accountId: string, sessionId: string) {
	const [session] = await tx
		.select()
		.from(scanSessions)
		.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
		.for('update');
	if (!session) throw new ScanError('ScanNotFound', 'Scan session not found', 404);
	return session;
}
export function assertReviewable(status: string) {
	if (!['open', 'pending_review'].includes(status))
		throw new ScanError('ScanClosed', 'Scan session is not open for review', 409);
}
export function assertOpen(status: string) {
	if (status !== 'open')
		throw new ScanError('ScanClosed', 'Scan session is not open for uploads', 409);
}
export async function ownedSession(db: Database, accountId: string, sessionId: string) {
	const [session] = await db
		.select()
		.from(scanSessions)
		.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
		.limit(1);
	if (!session) throw new ScanError('ScanNotFound', 'Scan session not found', 404);
	return session;
}
