import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { changePassword } from '#lib/server/auth/change-password.ts';
import { demoMode } from '#lib/server/auth/demo.ts';
import { requireSameOrigin, takeAuthAttempt } from '#lib/server/auth/local.ts';
import { validPassword } from '#lib/server/auth/password.ts';
import { writeSessionCookie } from '#lib/server/auth/session.ts';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/settings/password');
	return { demoMode };
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.locals.user) redirect(303, '/auth/login?returnTo=/settings/password');
		requireSameOrigin(event);
		const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
		if (demoMode)
			return fail(403, {
				success: false,
				message: 'Password changes are disabled in demo mode.',
				errors
			});
		takeAuthAttempt(event.getClientAddress());
		const form = await event.request.formData();
		const currentPassword = form.get('currentPassword');
		const newPassword = form.get('newPassword');
		const confirmPassword = form.get('confirmPassword');
		if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128)
			errors.currentPassword = 'Enter your current password.';
		if (!validPassword(newPassword))
			errors.newPassword = 'Use 12 to 128 characters for your new password.';
		if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword)
			errors.confirmPassword = 'The new passwords must match.';
		if (
			Object.keys(errors).length ||
			typeof currentPassword !== 'string' ||
			!validPassword(newPassword)
		)
			return fail(400, {
				success: false,
				message: 'Check the password fields and try again.',
				errors
			});
		const session = await changePassword(event.locals.user.accountId, currentPassword, newPassword);
		if (!session) {
			errors.currentPassword = 'Enter your current password and try again.';
			return fail(400, {
				success: false,
				message: 'Your current password could not be verified.',
				errors
			});
		}
		writeSessionCookie(event.cookies, session.token, event.url);
		return {
			success: true,
			message: 'Password changed. Your other sessions were signed out.',
			errors
		};
	}
};
