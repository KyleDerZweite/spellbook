import { privateEnv } from '$lib/env/private';
import { createNoIndexRedirect } from '$lib/seo/site';
import type { RequestHandler } from './$types';
import { getAuthSessionSecret, writeOAuthStateCookie } from '$lib/server/auth/session';
import {
	buildAuthorizationUrl,
	createRandomString,
	getZitadelAuthConfig,
	sanitizeReturnTo
} from '$lib/server/auth/zitadel';

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
	if (locals.user) {
		return createNoIndexRedirect(returnTo);
	}

	const config = getZitadelAuthConfig(privateEnv);
	const state = createRandomString();
	const nonce = createRandomString();
	const codeVerifier = createRandomString(48);
	const sessionSecret = getAuthSessionSecret(privateEnv);

	await writeOAuthStateCookie(cookies, sessionSecret, {
		state,
		nonce,
		codeVerifier,
		returnTo
	});

	return createNoIndexRedirect(
		await buildAuthorizationUrl(config, {
			state,
			nonce,
			codeVerifier
		})
	);
};
