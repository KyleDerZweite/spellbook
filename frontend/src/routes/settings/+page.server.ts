import { normalizeContactEmail } from '@spellbook/contracts/profile.ts';
import { fail, redirect } from '@sveltejs/kit';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { getProfileSettings } from '#lib/server/settings.ts';
import { application } from '#lib/server/composition.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
	return getProfileSettings(locals.user);
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
		requireSameOrigin(event);
		const form = await request.formData();
		const intent = form.get('intent');
		const errors: { email?: string; avatarId?: string } = {};
		if (intent === 'email') {
			const value = form.get('email');
			const email = normalizeContactEmail(value);
			if (email === null) {
				errors.email = 'Enter a valid email address, or leave it empty.';
				return fail(400, {
					intent,
					success: false,
					message: 'Check the email address and try again.',
					errors,
					email: typeof value === 'string' ? value : ''
				});
			}
			locals.user = (await application.profile.patch(locals.user, { email })).user;
			return {
				intent,
				success: true,
				message: 'Email saved.',
				savedEmail: locals.user.email,
				errors
			};
		}
		if (intent === 'avatar') {
			const avatarId = form.get('avatarId');
			if (!isAvatarId(avatarId)) {
				errors.avatarId = 'Choose an avatar from the collection.';
				return fail(400, {
					intent,
					success: false,
					message: 'Choose an avatar from the collection.',
					errors,
					avatarId: typeof avatarId === 'string' ? avatarId : ''
				});
			}
			locals.user = (await application.profile.patch(locals.user, { avatarId })).user;
			return { intent, success: true, message: 'Avatar saved.', errors };
		}
		return fail(400, {
			success: false,
			message: 'Choose the preference to save.',
			errors
		});
	}
};
