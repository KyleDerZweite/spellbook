import { privateEnv } from '$lib/env/private';
import { createNoIndexRedirect } from '$lib/seo/site';
import type { RequestHandler } from './$types';
import {
	clearOAuthStateCookie,
	getAuthSessionSecret,
	readOAuthStateCookie,
	writeSessionCookie
} from '$lib/server/auth/session';
import { exchangeAuthorizationCode, getOidcAuthConfig } from '$lib/server/auth/oidc';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const errorCode = url.searchParams.get('error');
	if (errorCode) {
		clearOAuthStateCookie(cookies);
		return createNoIndexRedirect('/');
	}

	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const sessionSecret = getAuthSessionSecret(privateEnv);
	const storedState = await readOAuthStateCookie(cookies, sessionSecret);

	if (!code || !returnedState || !storedState || storedState.state !== returnedState) {
		clearOAuthStateCookie(cookies);
		return createNoIndexRedirect('/');
	}

	const config = getOidcAuthConfig(privateEnv);
	const session = await exchangeAuthorizationCode(config, {
		code,
		codeVerifier: storedState.codeVerifier,
		expectedNonce: storedState.nonce
	});

	await writeSessionCookie(cookies, sessionSecret, session);
	clearOAuthStateCookie(cookies);

	return createNoIndexRedirect(storedState.returnTo);
};
