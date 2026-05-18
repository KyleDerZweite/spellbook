import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '$lib/auth/types';
import { db } from '$lib/server/db/client';
import { authIdentities, userProfiles } from '$lib/server/db/schema';

export interface ExternalIdentityInput {
	providerType: 'oidc';
	issuer: string;
	subject: string;
	username: string;
	email: string;
}

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

async function findLegacySubjectAccount(subject: string): Promise<string | null> {
	const [legacyProfile] = await db
		.select({ accountId: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, subject))
		.limit(1);

	return legacyProfile?.accountId ?? null;
}

export async function provisionExternalUser(input: ExternalIdentityInput): Promise<AuthUser> {
	const issuer = input.issuer.replace(/\/+$/, '');
	const [existingIdentity] = await db
		.select()
		.from(authIdentities)
		.where(
			and(
				eq(authIdentities.providerType, input.providerType),
				eq(authIdentities.issuer, issuer),
				eq(authIdentities.subject, input.subject)
			)
		)
		.limit(1);

	const accountId =
		existingIdentity?.accountId ??
		(await findLegacySubjectAccount(input.subject)) ??
		crypto.randomUUID();
	const user = {
		accountId,
		username: input.username,
		email: input.email
	};
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx
			.insert(userProfiles)
			.values({
				accountId,
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

		await tx
			.insert(authIdentities)
			.values({
				id: crypto.randomUUID(),
				accountId,
				providerType: input.providerType,
				issuer,
				subject: input.subject,
				emailAtLogin: user.email,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoUpdate({
				target: [authIdentities.providerType, authIdentities.issuer, authIdentities.subject],
				set: {
					accountId,
					emailAtLogin: user.email,
					updatedAt: now
				}
			});
	});

	return user;
}

export async function userExists(accountId: string): Promise<boolean> {
	const rows = await db
		.select({ accountId: userProfiles.accountId })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, accountId))
		.limit(1);
	return rows.length > 0;
}
