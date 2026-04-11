import { error, type RequestEvent } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import type { MobileAuthContext } from './types';
import { getZitadelAuthConfig, verifyBearerToken } from '$lib/server/auth/zitadel';

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
			event.locals.mobileBearerUser = verified.user;
			event.locals.mobileBearerToken = bearerToken;
			return {
				user: verified.user,
				token: bearerToken
			};
		} catch (err) {
			throw error(401, `Invalid bearer token: ${String(err)}`);
		}
	}

	if (event.locals.user && event.locals.spacetimeToken) {
		return {
			user: event.locals.user,
			token: event.locals.spacetimeToken
		};
	}

	throw error(401, 'Authentication required');
}
