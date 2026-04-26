import { eq } from 'drizzle-orm';
import type { AuthUser } from '$lib/auth/types';
import { db } from '$lib/server/db/client';
import { userProfiles } from '$lib/server/db/schema';

export async function ensureUserProfile(user: AuthUser): Promise<void> {
	const now = new Date();
	await db
		.insert(userProfiles)
		.values({
			accountId: user.accountId,
			username: user.username,
			email: user.email,
			lastSeenAt: now
		})
		.onConflictDoUpdate({
			target: userProfiles.accountId,
			set: {
				username: user.username,
				email: user.email,
				lastSeenAt: now
			}
		});
}

export async function userExists(accountId: string): Promise<boolean> {
	const rows = await db
		.select({ accountId: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, accountId))
		.limit(1);
	return rows.length > 0;
}
