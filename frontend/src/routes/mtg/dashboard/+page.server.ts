import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDashboard } from '#lib/server/data/dashboard.ts';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Sign in to view your dashboard.');
	try {
		return { dashboard: await getDashboard(locals.user.accountId), loadError: null };
	} catch {
		return { dashboard: null, loadError: 'Your account data could not be loaded. Try again.' };
	}
};
