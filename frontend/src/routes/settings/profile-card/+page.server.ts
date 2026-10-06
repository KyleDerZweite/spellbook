import { fail, redirect } from '@sveltejs/kit';
import { isProfileArtworkId } from '#lib/profile/artwork.ts';
import { validateProfileCard } from '#lib/profile/card.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { getProfileSettings } from '#lib/server/settings.ts';
import { application } from '#lib/server/composition.ts';
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
		const partial = form.get('partial') === 'true';
		const current = partial ? await getProfileSettings(locals.user) : null;
		const artworkId =
			partial && !form.has('artworkId') ? current!.user.artworkId : form.get('artworkId');
		const cardInput = Object.fromEntries(
			cardFields.map((field) => [
				field,
				partial && !form.has(field)
					? current!.card[field]
					: field === 'legendary'
						? form.get(field) === 'on'
						: form.get(field)
			])
		);
		const text = (field: (typeof cardFields)[number]) => {
			const value = form.get(field);
			return typeof value === 'string'
				? value.replace(/\r\n?/g, '\n')
				: partial && typeof current!.card[field] === 'string'
					? String(current!.card[field])
					: '';
		};
		const card = {
			template: text('template'),
			name: text('name'),
			frame: text('frame'),
			legendary:
				partial && !form.has('legendary')
					? current!.card.legendary
					: form.get('legendary') === 'on',
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
		let baseline: typeof validatedCard.value | null = null;
		if (form.has('baselineCard')) {
			try {
				const result = validateProfileCard(JSON.parse(String(form.get('baselineCard'))));
				if (result.success) baseline = result.value;
			} catch {}
			if (!baseline || !isProfileArtworkId(form.get('baselineArtworkId')))
				return fail(400, {
					success: false,
					message: 'Reload the card editor and try again.',
					errors: { form: 'Invalid saved card baseline.' },
					card,
					artworkId
				});
		}
		const profileCard = Object.fromEntries(
			Object.entries(validatedCard.value).filter(([field, value]) =>
				partial
					? form.has(field)
					: baseline
						? value !== baseline[field as keyof typeof baseline]
						: true
			)
		);
		const artworkChanged =
			form.has('artworkId') && (!baseline || artworkId !== form.get('baselineArtworkId'));
		locals.user = (
			await application.profile.patch(locals.user, {
				...(artworkChanged ? { artworkId } : {}),
				...(Object.keys(profileCard).length ? { profileCard } : {})
			})
		).user;

		return { success: true, message: 'Profile card saved.' };
	}
};
