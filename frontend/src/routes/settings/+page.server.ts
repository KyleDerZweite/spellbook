import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { isProfileArtworkId } from '#lib/profile/artwork.ts';
import { validateProfileCard } from '#lib/profile/card.ts';
import { getProfileCard, getProfileTotals } from '#lib/server/data/profile.ts';
import { db } from '#lib/server/db/client.ts';
import { userProfiles } from '#lib/server/db/schema.ts';
import type { Actions, PageServerLoad } from './$types';

const cardFields = [
	'template',
	'name',
	'frame',
	'legendary',
	'rarity',
	'manaCost',
	'typeLine',
	'rulesText',
	'flavorText',
	'power',
	'toughness'
] as const;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
	const card = await getProfileCard(locals.user.accountId, locals.user.username);
	try {
		return {
			user: locals.user,
			card,
			totals: await getProfileTotals(locals.user.accountId),
			statsError: null
		};
	} catch {
		return {
			user: locals.user,
			card,
			totals: null,
			statsError: 'Your collection totals are temporarily unavailable.'
		};
	}
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
		const form = await request.formData();
		const avatarId = form.get('avatarId');
		const artworkId = form.get('artworkId');
		const hasCard = cardFields.some((field) => form.has(field));
		const cardInput = Object.fromEntries(
			cardFields.map((field) => [
				field,
				field === 'legendary' ? form.get(field) === 'on' : form.get(field)
			])
		);
		const text = (field: (typeof cardFields)[number]) => {
			const value = form.get(field);
			return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';
		};
		const card = {
			template: text('template'),
			name: text('name'),
			frame: text('frame'),
			legendary: form.get('legendary') === 'on',
			rarity: text('rarity'),
			manaCost: text('manaCost'),
			typeLine: text('typeLine'),
			rulesText: text('rulesText'),
			flavorText: text('flavorText'),
			power: text('power'),
			toughness: text('toughness')
		};
		const validatedCard = hasCard ? validateProfileCard(cardInput) : null;
		const selection = {
			avatarId: typeof avatarId === 'string' ? avatarId : '',
			artworkId: typeof artworkId === 'string' ? artworkId : locals.user.artworkId
		};
		const message = !isAvatarId(avatarId)
			? 'Choose an avatar from the collection.'
			: form.has('artworkId') && !isProfileArtworkId(artworkId)
				? 'Choose artwork from the collection.'
				: validatedCard && !validatedCard.success
					? 'Check the card fields and try again.'
					: null;
		if (message || !isAvatarId(avatarId)) {
			return fail(400, {
				success: false,
				message,
				errors: validatedCard && !validatedCard.success ? validatedCard.errors : {},
				...(hasCard ? { card } : {}),
				...selection
			});
		}
		const [profile] = await db
			.update(userProfiles)
			.set({
				avatarId,
				...(isProfileArtworkId(artworkId) ? { artworkId } : {}),
				...(validatedCard?.success ? { profileCard: validatedCard.value } : {})
			})
			.where(eq(userProfiles.accountId, locals.user.accountId))
			.returning({ avatarId: userProfiles.avatarId, artworkId: userProfiles.artworkId });
		if (!profile) redirect(303, '/auth/login?returnTo=/settings');
		locals.user = { ...locals.user, ...profile };
		return { success: true, message: 'Profile saved.' };
	}
};
