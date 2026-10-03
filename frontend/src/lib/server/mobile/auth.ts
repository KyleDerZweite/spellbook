import { error, type RequestEvent } from '@sveltejs/kit';
import type { MobileAuthContext } from './types';
import { getBearerToken, validateSession } from '$lib/server/auth/session';
import { requireSameOrigin } from '$lib/server/auth/local';

export async function requireMobileAuth(event: RequestEvent): Promise<MobileAuthContext> {
	if (event.request.headers.has('authorization')) {
		const user = await validateSession(getBearerToken(event.request));
		if (!user) error(401, 'Invalid bearer token');
		event.locals.mobileBearerUser = user;
		return { user };
	}
	if (event.locals.user) {
		if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method)) requireSameOrigin(event);
		return { user: event.locals.user };
	}
	error(401, 'Authentication required');
}
