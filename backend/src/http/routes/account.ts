import { SUMMARY_RANGE_MESSAGE, type ProfilePatch } from '@spellbook/contracts/profile.ts';
import { requireMobileAuth, requireSameOrigin, selectedToken } from '../auth.ts';
import { validPassword } from '../../auth/password.ts';
import { writeSessionCookie } from '../cookies.ts';
import { error, json } from '../errors.ts';
import { readFormData, readJsonObject } from '../request.ts';
import type { HttpDependencies, HttpRoute, RouteContext } from '../types.ts';

export function createAccountRoutes(dependencies: HttpDependencies): HttpRoute[] {
	const { application, publicOrigin } = dependencies;
	async function passwordForm(context: RouteContext) {
		requireSameOrigin(context, dependencies);
		const { user } = await requireMobileAuth(context, dependencies);
		const errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
		if (dependencies.demoMode)
			return json(
				{ success: false, message: 'Password changes are disabled in demo mode.', errors },
				{ status: 403 }
			);
		try {
			application.auth.takeAuthAttempt(context.clientAddress);
			const data = await readFormData(context.request);
			const currentPassword = data.get('currentPassword');
			const newPassword = data.get('newPassword');
			const confirmPassword = data.get('confirmPassword');
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
				return json(
					{
						success: false,
						message: 'Check the password fields and try again.',
						errors
					},
					{ status: 400 }
				);
			const session = await application.auth.changePassword(user, currentPassword, newPassword);
			if (!session)
				return json(
					{
						success: false,
						message: 'Your current password could not be verified.',
						errors: {
							currentPassword: 'Enter your current password and try again.'
						}
					},
					{ status: 400 }
				);
			const headers = new Headers();
			if (!context.request.headers.has('authorization'))
				writeSessionCookie(headers, session.token, publicOrigin);
			return json(
				{ success: true, token: session.token, expiresAt: session.expiresAt },
				{ headers }
			);
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'kind' in cause) {
				if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
				if (cause.kind === 'RateLimited')
					error(429, cause instanceof Error ? cause.message : 'Authentication is busy.');
			}
			throw cause;
		}
	}
	async function account(
		context: RouteContext,
		operation: 'get' | 'patch' | 'dashboard' | 'password' | 'session'
	) {
		const { user } = await requireMobileAuth(context, dependencies);
		const headers = new Headers({ 'Cache-Control': 'no-store' });
		try {
			let result: unknown;
			switch (operation) {
				case 'get':
					result = await application.profile.get(user);
					break;
				case 'patch':
					result = await application.profile.patch(
						user,
						(await readJsonObject(context.request)) as ProfilePatch
					);
					break;
				case 'dashboard':
					result = await application.dashboard.get(user);
					break;
				case 'session': {
					const actor = await application.auth.requireActor(user);
					const session = await application.auth.inspectSession(selectedToken(context.request));
					if (!session) error(401, 'Authentication required');
					result = { user: actor, expiresAt: session.expiresAt };
					break;
				}
				case 'password': {
					application.auth.takeAuthAttempt(context.clientAddress);
					const body = await readJsonObject(context.request);
					if (
						Object.keys(body).some((key) => !['currentPassword', 'newPassword'].includes(key)) ||
						typeof body.currentPassword !== 'string' ||
						typeof body.newPassword !== 'string'
					)
						error(400, 'Invalid password fields');
					const session = await application.auth.changePassword(
						user,
						body.currentPassword,
						body.newPassword
					);
					if (!session) error(400, 'Unable to change password with those details');
					if (!context.request.headers.has('authorization'))
						writeSessionCookie(headers, session.token, publicOrigin);
					result = { token: session.token, expiresAt: session.expiresAt };
					break;
				}
			}
			return json(result, { headers });
		} catch (cause) {
			if (cause && typeof cause === 'object' && 'kind' in cause) {
				if (cause.kind === 'SummaryOutOfRange') error(503, SUMMARY_RANGE_MESSAGE);
				if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
				if (cause.kind === 'RateLimited')
					error(429, cause instanceof Error ? cause.message : 'Too many attempts');
				if (cause.kind === 'ValidationFailed')
					return json(
						{
							kind: cause.kind,
							message: cause instanceof Error ? cause.message : 'Invalid profile fields',
							fields: 'fields' in cause ? cause.fields : {}
						},
						{ status: 400, headers }
					);
			}
			throw cause;
		}
	}
	return [
		{ method: 'POST', path: '/api/web/v1/password', handle: passwordForm },
		{ method: 'GET', path: '/api/auth/session', handle: (context) => account(context, 'session') },
		{ method: 'GET', path: '/api/account/profile', handle: (context) => account(context, 'get') },
		{
			method: 'PATCH',
			path: '/api/account/profile',
			handle: (context) => account(context, 'patch')
		},
		{
			method: 'GET',
			path: '/api/account/dashboard',
			handle: (context) => account(context, 'dashboard')
		},
		{
			method: 'POST',
			path: '/api/account/password',
			handle: (context) => account(context, 'password')
		}
	];
}
