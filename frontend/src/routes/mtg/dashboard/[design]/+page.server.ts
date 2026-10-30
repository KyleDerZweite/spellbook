import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { demoMode } from '#lib/server/auth/demo.ts';
import { getDashboard } from '#lib/server/data/dashboard.ts';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (process.env.NODE_ENV !== 'development' && !demoMode) error(404, 'Not found');
	if (!/^[1-5]$/.test(params.design)) error(404, 'Not found');
	if (!locals.user) error(401, 'Sign in to view your dashboard.');
	try {
		return {
			design: Number(params.design),
			dashboard: await getDashboard(locals.user),
			loadError: null
		};
	} catch {
		return {
			design: Number(params.design),
			dashboard: null,
			loadError: 'Your account data could not be loaded. Try again.'
		};
	}
};
