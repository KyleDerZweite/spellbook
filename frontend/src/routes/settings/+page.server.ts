import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isAvatarId } from '#lib/profile/avatars.ts';
import { isProfileArtworkId } from '#lib/profile/artwork.ts';
import { getProfileTotals } from '#lib/server/data/profile.ts';
import { db } from '#lib/server/db/client.ts';
import { userProfiles } from '#lib/server/db/schema.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings');
	try {
		return {
			user: locals.user,
			totals: await getProfileTotals(locals.user.accountId),
			statsError: null
		};
	} catch {
		return {
			user: locals.user,
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
		const selection = {
			avatarId: typeof avatarId === 'string' ? avatarId : '',
			artworkId: typeof artworkId === 'string' ? artworkId : locals.user.artworkId
		};
		if (!isAvatarId(avatarId)) {
			return fail(400, {
				success: false,
				message: 'Choose an avatar from the collection.',
				...selection
			});
		}
		if (form.has('artworkId') && !isProfileArtworkId(artworkId)) {
			return fail(400, {
				success: false,
				message: 'Choose artwork from the collection.',
				...selection
			});
		}
		const [profile] = await db
			.update(userProfiles)
			.set({ avatarId, ...(isProfileArtworkId(artworkId) ? { artworkId } : {}) })
			.where(eq(userProfiles.accountId, locals.user.accountId))
			.returning({ avatarId: userProfiles.avatarId, artworkId: userProfiles.artworkId });
		if (!profile) redirect(303, '/auth/login?returnTo=/settings');
		locals.user = { ...locals.user, ...profile };
		return { success: true, message: 'Profile saved.' };
	}
};
