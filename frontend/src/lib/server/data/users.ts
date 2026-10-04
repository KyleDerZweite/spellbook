import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/client.ts';
import { userProfiles } from '#lib/server/db/schema.ts';

export async function userExists(accountId: string): Promise<boolean> {
	const rows = await db
		.select({ accountId: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, accountId))
		.limit(1);
	return rows.length > 0;
}
