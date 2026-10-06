import type { AuthUser } from '#lib/auth/types.ts';
import { getProfileCard, getProfileTotals } from '#lib/server/data/profile.ts';

export async function getProfileSettings(user: AuthUser) {
	const card = await getProfileCard(user.accountId, user.username);
	try {
		return { user, card, totals: await getProfileTotals(user.accountId), statsError: null };
	} catch {
		return {
			user,
			card,
			totals: null,
			statsError: 'Your collection totals are temporarily unavailable.'
		};
	}
}
