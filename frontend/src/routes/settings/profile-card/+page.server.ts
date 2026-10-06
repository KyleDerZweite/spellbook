import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isProfileArtworkId } from '#lib/profile/artwork.ts';
import { validateProfileCard } from '#lib/profile/card.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { getProfileSettings } from '#lib/server/settings.ts';
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
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings/profile-card');
	return getProfileSettings(locals.user);
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		if (!locals.user) redirect(303, '/auth/login?returnTo=/settings/profile-card');
		requireSameOrigin(event);
		const form = await request.formData();
		const artworkId = form.get('artworkId');
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
		const validatedCard = validateProfileCard(cardInput);
		if (!isProfileArtworkId(artworkId) || !validatedCard.success) {
			return fail(400, {
				success: false,
				message: !isProfileArtworkId(artworkId)
					? 'Choose artwork from the collection.'
					: 'Check the card fields and try again.',
				errors: validatedCard.success ? {} : validatedCard.errors,
				card,
				artworkId: typeof artworkId === 'string' ? artworkId : ''
			});
		}
		const [profile] = await db
			.update(userProfiles)
			.set({ artworkId, profileCard: validatedCard.value })
			.where(eq(userProfiles.accountId, locals.user.accountId))
			.returning({ artworkId: userProfiles.artworkId });
		if (!profile) redirect(303, '/auth/login?returnTo=/settings/profile-card');
		locals.user = { ...locals.user, ...profile };
		return { success: true, message: 'Profile card saved.' };
	}
};
