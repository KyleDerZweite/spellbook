import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { submitAuthForm } from '#lib/server/auth/forms.ts';
import { sanitizeReturnTo } from '#lib/server/auth/local.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
	if (locals.user) redirect(303, returnTo);
	return { returnTo };
};

export const actions: Actions = { default: (event) => submitAuthForm(event, 'login') };
