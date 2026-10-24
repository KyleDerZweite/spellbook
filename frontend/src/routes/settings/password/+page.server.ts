import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { demoMode } from '#lib/server/auth/demo.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { writeSessionCookie } from '#lib/server/auth/session.ts';
import {
	submitCredentialForm,
	type PasswordFormFailure,
	type PasswordFormSuccess
} from '#lib/server/auth/forms.ts';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings/password');
	return { demoMode };
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(303, '/auth/login?returnTo=/settings/password');
		requireSameOrigin(event);
		const result = await submitCredentialForm<PasswordFormSuccess, PasswordFormFailure>(
			event,
			'/api/v1/web/password'
		);
		if (!result.ok) return fail(result.status, result.data);
		event.locals.api.replaceToken(result.data.token);
		writeSessionCookie(event.cookies, result.data.token, event.url);
		const errors: PasswordFormFailure['errors'] = {};
		return {
			success: true,
			message: 'Password changed. Your other sessions were signed out.',
			errors
		};
	}
};
