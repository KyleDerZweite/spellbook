import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { sharedDemoLogin } from '#lib/server/auth/demo.ts';

/** Short shareable entry point for the shared demo account. */
export const load: PageServerLoad = () => {
	if (!sharedDemoLogin()) error(404, 'Not Found');
	redirect(303, '/auth/login/demo');
};
