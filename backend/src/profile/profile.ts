import { and, eq, sql } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import {
	isAvatarId,
	normalizeContactEmail,
	isProfileArtworkId,
	type ProfileApplication,
	type ProfileCardDefinition,
	type ProfilePatch,
	type ProfileTotals
} from '@spellbook/contracts/profile.ts';
import {
	defaultProfileCard,
	demoProfileCard,
	validateProfileCard
} from '@spellbook/contracts/profile-card.ts';
import type { Database } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { decks, inventoryCards, userProfiles } from '../db/schema.ts';

export class ProfileError extends Error {
	readonly kind = 'ValidationFailed';
	readonly fields: Record<string, string>;
	constructor(message: string, fields: Record<string, string | undefined>) {
		super(message);
		this.fields = Object.fromEntries(
			Object.entries(fields).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		);
	}
}

export function createProfile(
	db: Database,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>,
	config: { demoMode: boolean }
): ProfileApplication {
	function cardFor(value: unknown, username: string): ProfileCardDefinition {
		const card = validateProfileCard(value);
		return card.success
			? card.value
			: config.demoMode && username === 'demo'
				? demoProfileCard()
				: defaultProfileCard(username);
	}
	async function totals(accountId: string): Promise<ProfileTotals> {
		const [value] = await db
			.select({
				total: sql<number>`coalesce(sum(${inventoryCards.quantity}),0)`.mapWith(Number),
				names: sql<number>`count(distinct ${inventoryCards.canonicalCardId})`.mapWith(Number),
				printings: sql<number>`count(distinct ${inventoryCards.catalogCardId})`.mapWith(Number),
				sets: sql<number>`count(distinct ${inventoryCards.setCode})`.mapWith(Number),
				foils:
					sql<number>`coalesce(sum(${inventoryCards.quantity}) filter(where ${inventoryCards.finish}='foil'),0)`.mapWith(
						Number
					),
				decks:
					sql<number>`(select count(*) from ${decks} where ${decks.accountId}=${accountId} and ${decks.game}='mtg')`.mapWith(
						Number
					)
			})
			.from(inventoryCards)
			.where(and(eq(inventoryCards.accountId, accountId), eq(inventoryCards.game, 'mtg')));
		return value;
	}
	async function get(actor: AuthUser) {
		const user = await auth.requireActor(actor);
		const [profile] = await db
			.select({ card: userProfiles.profileCard })
			.from(userProfiles)
			.where(eq(userProfiles.accountId, user.accountId));
		const card = cardFor(profile?.card, user.username);
		try {
			return { user, card, totals: await totals(user.accountId), statsError: null };
		} catch {
			return {
				user,
				card,
				totals: null,
				statsError: 'Your collection totals are temporarily unavailable.'
			};
		}
	}
	async function patch(actor: AuthUser, input: ProfilePatch) {
		const user = await auth.requireActor(actor);
		if (
			!input ||
			typeof input !== 'object' ||
			Array.isArray(input) ||
			Object.keys(input).some(
				(key) => !['email', 'avatarId', 'artworkId', 'profileCard'].includes(key)
			)
		)
			throw new ProfileError('Choose the preference to save.', { form: 'Unknown profile field.' });
		const fields: Record<string, string> = {};
		const update: {
			email?: string;
			avatarId?: string;
			artworkId?: string;
			profileCard?: ProfileCardDefinition;
		} = {};
		if ('email' in input) {
			const email = normalizeContactEmail(input.email);
			if (email === null) fields.email = 'Enter a valid email address, or leave it empty.';
			else update.email = email;
		}
		if ('avatarId' in input) {
			if (!isAvatarId(input.avatarId)) fields.avatarId = 'Choose an avatar from the collection.';
			else update.avatarId = input.avatarId;
		}
		if ('artworkId' in input) {
			if (!isProfileArtworkId(input.artworkId))
				fields.artworkId = 'Choose artwork from the collection.';
			else update.artworkId = input.artworkId;
		}
		if (Object.keys(fields).length)
			throw new ProfileError('Check the profile fields and try again.', fields);
		if (!Object.keys(input).length) return get(actor);
		await db.transaction(async (tx) => {
			const [profile] = await tx
				.select({ card: userProfiles.profileCard })
				.from(userProfiles)
				.where(eq(userProfiles.accountId, user.accountId))
				.for('update');
			await auth.requireActor(actor, tx);
			if ('profileCard' in input) {
				const current = cardFor(profile?.card, user.username);
				const patch = input.profileCard;
				if (
					!patch ||
					typeof patch !== 'object' ||
					Array.isArray(patch) ||
					Object.keys(patch).some((key) => !Object.hasOwn(current, key))
				)
					throw new ProfileError('Check the card fields and try again.', {
						form: 'Unknown card field.'
					});
				if (Object.keys(patch).length) {
					const card = validateProfileCard({ ...current, ...patch });
					if (!card.success)
						throw new ProfileError('Check the card fields and try again.', card.errors);
					update.profileCard = card.value;
				}
			}
			if (!Object.keys(update).length) return;
			await tx.update(userProfiles).set(update).where(eq(userProfiles.accountId, user.accountId));
		});
		return get(actor);
	}
	return { get, patch };
}
