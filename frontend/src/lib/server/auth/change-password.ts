import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/client.ts';
import { authSessions, localCredentials, userProfiles } from '#lib/server/db/schema.ts';
import { demoMode } from './demo';
import { withPasswordDerivation } from './local';
import { hashPassword, validPassword, verifyPassword } from './password';
import { createSession } from './session';

export async function changePassword(
	accountId: string,
	currentPassword: string,
	newPassword: string
) {
	if (demoMode || !currentPassword || currentPassword.length > 128 || !validPassword(newPassword))
		return null;
	return withPasswordDerivation(async () => {
		const [credential] = await db
			.select({ passwordHash: localCredentials.passwordHash })
			.from(localCredentials)
			.where(eq(localCredentials.accountId, accountId));
		if (!(await verifyPassword(currentPassword, credential?.passwordHash ?? null)) || !credential)
			return null;
		const passwordHash = await hashPassword(newPassword);
		return db.transaction(async (tx) => {
			// Share the account lock with session issuance and operator recovery.
			const [profile] = await tx
				.select({ accountId: userProfiles.accountId })
				.from(userProfiles)
				.where(eq(userProfiles.accountId, accountId))
				.for('update');
			if (!profile) return null;
			const [current] = await tx
				.select({ passwordHash: localCredentials.passwordHash })
				.from(localCredentials)
				.where(eq(localCredentials.accountId, accountId));
			if (current?.passwordHash !== credential.passwordHash) return null;
			await tx
				.update(localCredentials)
				.set({ passwordHash, updatedAt: new Date() })
				.where(eq(localCredentials.accountId, accountId));
			await tx.delete(authSessions).where(eq(authSessions.accountId, accountId));
			const session = await createSession(accountId, passwordHash, tx);
			if (!session) throw new Error('Unable to issue the replacement session');
			return session;
		});
	});
}
