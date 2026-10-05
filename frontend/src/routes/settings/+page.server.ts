import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { db } from '#lib/server/db/client.ts';
import { userProfiles } from '#lib/server/db/schema.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
	return { user: locals.user };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
		const form = await request.formData();
		const avatarId = form.get('avatarId');
		if (!isAvatarId(avatarId)) {
			return fail(400, {
				success: false,
				message: 'Choose an avatar from the collection.',
				avatarId: typeof avatarId === 'string' ? avatarId : ''
			});
		}
		const [profile] = await db
			.update(userProfiles)
			.set({ avatarId })
			.where(eq(userProfiles.accountId, locals.user.accountId))
			.returning({ avatarId: userProfiles.avatarId });
		if (!profile) redirect(303, '/auth/login?returnTo=/settings');
		locals.user = { ...locals.user, avatarId: profile.avatarId };
		return { success: true, message: 'Avatar saved.' };
	}
};
