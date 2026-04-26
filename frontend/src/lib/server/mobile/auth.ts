import { error, type RequestEvent } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import type { MobileAuthContext } from './types';
import { getZitadelAuthConfig, verifyBearerToken } from '$lib/server/auth/zitadel';
import { ensureUserProfile } from '$lib/server/data/users';

function getBearerToken(header: string | null): string | null {
	if (!header) {
		return null;
	}

	const [scheme, token] = header.split(/\s+/, 2);
	if (scheme?.toLowerCase() !== 'bearer' || !token) {
		return null;
	}

	return token.trim() || null;
}

export async function requireMobileAuth(event: RequestEvent): Promise<MobileAuthContext> {
	const bearerToken = getBearerToken(event.request.headers.get('authorization'));
	if (bearerToken) {
		const config = getZitadelAuthConfig({
			...privateEnv,
			ZITADEL_CLIENT_ID: privateEnv.ZITADEL_MOBILE_CLIENT_ID ?? privateEnv.ZITADEL_CLIENT_ID
		});
		try {
			const verified = await verifyBearerToken(config, bearerToken);
			await ensureUserProfile(verified.user);
			event.locals.mobileBearerUser = verified.user;
			return {
				user: verified.user
			};
		} catch (err) {
			throw error(401, `Invalid bearer token: ${String(err)}`);
		}
	}

	if (event.locals.user) {
		return {
			user: event.locals.user
		};
	}

	throw error(401, 'Authentication required');
}
