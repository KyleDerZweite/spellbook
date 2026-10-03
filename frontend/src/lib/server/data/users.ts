import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { userProfiles } from '$lib/server/db/schema';

export async function userExists(accountId: string): Promise<boolean> {
	const rows = await db
		.select({ accountId: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, accountId))
		.limit(1);
	return rows.length > 0;
}
