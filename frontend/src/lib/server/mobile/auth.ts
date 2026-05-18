import { error, type RequestEvent } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import type { MobileAuthContext } from './types';
import { getMobileOidcAuthConfig, verifyBearerToken } from '$lib/server/auth/oidc';

const log = console;

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
		const config = getMobileOidcAuthConfig(privateEnv);
		try {
			const verified = await verifyBearerToken(config, bearerToken);
			event.locals.mobileBearerUser = verified.user;
			return {
				user: verified.user
			};
		} catch (err) {
			log.warn('Mobile bearer token verification failed', err);
			throw error(401, 'Invalid bearer token');
		}
	}

	if (event.locals.user) {
		return {
			user: event.locals.user
		};
	}

	throw error(401, 'Authentication required');
}
