import { error, fail, redirect } from '@sveltejs/kit';
import { isProfileArtworkId } from '#lib/profile/artwork.ts';
import {
	validateProfileCard,
	type ProfileCardErrors,
	type ProfileCardDefinition
} from '#lib/profile/card.ts';
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
		let baseline: ProfileCardDefinition | null = null;
		if (form.has('baselineCard')) {
			try {
				const result = validateProfileCard(JSON.parse(String(form.get('baselineCard'))));
				if (result.success) baseline = result.value;
			} catch {}
		}
		const draftBase = baseline ?? current?.card;

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
				: partial && typeof draftBase?.[field] === 'string'
					? String(draftBase[field])
					: '';
		};
		const card = {
			template: text('template'),
			name: text('name'),
			frame: text('frame'),
			legendary:
				partial && !form.has('legendary') ? draftBase!.legendary : form.get('legendary') === 'on',
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
		if (form.has('baselineCard')) {
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
		let savedCard;
		try {
			const saved = await application.profile.patch(locals.user, {
				...(artworkChanged ? { artworkId } : {}),
				...(Object.keys(profileCard).length ? { profileCard } : {})
			});
			locals.user = saved.user;
			savedCard = { card: saved.card, artworkId: saved.user.artworkId };
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'kind' in cause) {
				if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
				if (
					cause.kind === 'ValidationFailed' &&
					'fields' in cause &&
					cause.fields &&
					typeof cause.fields === 'object'
				) {
					const errors: ProfileCardErrors = {};
					for (const field of [...cardFields, 'form'] as const) {
						const value = Reflect.get(cause.fields, field);
						if (typeof value === 'string') errors[field] = value;
					}
					return fail(400, {
						success: false,
						message: 'Your saved card changed. Review the highlighted fields and try again.',
						errors,
						card,
						artworkId
					});
				}
			}
			throw cause;
		}

		return { success: true, message: 'Profile card saved.', savedCard };
	}
};
