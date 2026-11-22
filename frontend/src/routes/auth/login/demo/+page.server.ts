import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sharedDemoLogin } from '#lib/server/auth/demo.ts';
import { submitAuthForm } from '#lib/server/auth/forms.ts';
import { sanitizeReturnTo } from '#lib/server/auth/local.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!sharedDemoLogin()) error(404, 'Not Found');
	const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
	if (locals.user) redirect(303, returnTo);
	return { returnTo };
};

// Pre-filled form only; signing in still takes an explicit, same-origin POST.
export const actions: Actions = {
	default: (event) => {
		if (!sharedDemoLogin()) error(404, 'Not Found');
		return submitAuthForm(event, 'login');
	}
};
