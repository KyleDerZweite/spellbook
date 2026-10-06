import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { getProfileSettings } from '#lib/server/settings.ts';
import { db } from '#lib/server/db/client.ts';
import { userProfiles } from '#lib/server/db/schema.ts';
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
			const email = typeof value === 'string' ? value.trim() : '';
			if (
				typeof value !== 'string' ||
				email.length > 254 ||
				(email !== '' &&
					!/^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+$/i.test(
						email
					))
			) {
				errors.email = 'Enter a valid email address, or leave it empty.';
				return fail(400, {
					intent,
					success: false,
					message: 'Check the email address and try again.',
					errors,
					email: typeof value === 'string' ? value : ''
				});
			}
			const [profile] = await db
				.update(userProfiles)
				.set({ email })
				.where(eq(userProfiles.accountId, locals.user.accountId))
				.returning({ email: userProfiles.email });
			if (!profile) redirect(303, '/auth/login?returnTo=/settings');
			locals.user = { ...locals.user, ...profile };
			return { intent, success: true, message: 'Email saved.', errors };
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
			const [profile] = await db
				.update(userProfiles)
				.set({ avatarId })
				.where(eq(userProfiles.accountId, locals.user.accountId))
				.returning({ avatarId: userProfiles.avatarId });
			if (!profile) redirect(303, '/auth/login?returnTo=/settings');
			locals.user = { ...locals.user, ...profile };
			return { intent, success: true, message: 'Avatar saved.', errors };
		}
		return fail(400, {
			success: false,
			message: 'Choose the preference to save.',
			errors
		});
	}
};
