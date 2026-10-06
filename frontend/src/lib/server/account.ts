import { error, json, type RequestEvent } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject } from '#lib/server/http/request.ts';
import { takeAuthAttempt } from '#lib/server/auth/local.ts';
import { writeSessionCookie, getBearerToken, SESSION_COOKIE } from '#lib/server/auth/session.ts';
import { SUMMARY_RANGE_MESSAGE, type ProfilePatch } from '@spellbook/contracts/profile.ts';

export async function accountResponse(
	event: RequestEvent,
	operation: 'get' | 'patch' | 'dashboard' | 'password' | 'session'
) {
	const { user } = await requireMobileAuth(event);
	try {
		let result: unknown;
		switch (operation) {
			case 'get':
				result = await application.profile.get(user);
				break;
			case 'patch':
				result = await application.profile.patch(
					user,
					(await readJsonObject(event.request)) as ProfilePatch
				);
				break;
			case 'dashboard':
				result = await application.dashboard.get(user);
				break;
			case 'session': {
				const actor = await application.auth.requireActor(user);
				// Resolve the selected session through the same bearer-preference transport rule.
				const token = event.request.headers.has('authorization')
					? getBearerToken(event.request)
					: event.cookies.get(SESSION_COOKIE);
				const session = await application.auth.inspectSession(token);
				if (!session) error(401, 'Authentication required');
				result = { user: actor, expiresAt: session.expiresAt };
				break;
			}
			case 'password': {
				takeAuthAttempt(event.getClientAddress());
				const body = await readJsonObject(event.request);
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
				if (!event.request.headers.has('authorization'))
					writeSessionCookie(event.cookies, session.token, event.url);
				result = { token: session.token, expiresAt: session.expiresAt };
				break;
			}
		}
		return json(result, { headers: { 'Cache-Control': 'no-store' } });
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
					{ status: 400, headers: { 'Cache-Control': 'no-store' } }
				);
		}
		throw cause;
	}
}
