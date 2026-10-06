import { and, eq, sql } from 'drizzle-orm';
import {
	defaultProfileCard,
	demoProfileCard,
	validateProfileCard,
	type ProfileCardDefinition
} from '#lib/profile/card.ts';
import type { ProfileTotals } from '#lib/profile/types.ts';
import { db } from '#lib/server/db/client.ts';
import { demoMode } from '#lib/server/auth/demo.ts';
import { decks, inventoryCards, userProfiles } from '#lib/server/db/schema.ts';

export async function getProfileCard(
	accountId: string,
	username: string
): Promise<ProfileCardDefinition> {
	const [profile] = await db
		.select({ card: userProfiles.profileCard })
		.from(userProfiles)
		.where(eq(userProfiles.accountId, accountId));
	const card = validateProfileCard(profile?.card);
	if (card.success) return card.value;
	return demoMode && username === 'demo' ? demoProfileCard() : defaultProfileCard(username);
}

export async function getProfileTotals(accountId: string): Promise<ProfileTotals> {
	const [totals] = await db
		.select({
			total: sql<number>`coalesce(sum(${inventoryCards.quantity}), 0)`.mapWith(Number),
			names: sql<number>`count(distinct ${inventoryCards.canonicalCardId})`.mapWith(Number),
			printings: sql<number>`count(distinct ${inventoryCards.catalogCardId})`.mapWith(Number),
			sets: sql<number>`count(distinct ${inventoryCards.setCode})`.mapWith(Number),
			foils:
				sql<number>`coalesce(sum(${inventoryCards.quantity}) filter (where ${inventoryCards.finish} = 'foil'), 0)`.mapWith(
					Number
				),
			decks:
				sql<number>`(select count(*) from ${decks} where ${decks.accountId} = ${accountId} and ${decks.game} = 'mtg')`.mapWith(
					Number
				)
		})
		.from(inventoryCards)
		.where(and(eq(inventoryCards.accountId, accountId), eq(inventoryCards.game, 'mtg')));
	return totals;
}
