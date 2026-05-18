import { privateEnv } from '$lib/env/private';
import { createNoIndexRedirect } from '$lib/seo/site';
import type { RequestHandler } from './$types';
import { buildLogoutUrl, getOidcAuthConfig } from '$lib/server/auth/oidc';
import {
	clearOAuthStateCookie,
	clearSessionCookie,
	getAuthSessionSecret,
	readSessionCookie
} from '$lib/server/auth/session';

export const GET: RequestHandler = async ({ cookies }) => {
	const session = await readSessionCookie(cookies, getAuthSessionSecret(privateEnv));
	clearOAuthStateCookie(cookies);
	clearSessionCookie(cookies);

	const config = getOidcAuthConfig(privateEnv);
	return createNoIndexRedirect(await buildLogoutUrl(config, session?.idToken));
};
