import { redirect } from '@sveltejs/kit';
import { privateEnv } from '$lib/env/private';
import type { RequestHandler } from './$types';
import { buildLogoutUrl, getZitadelAuthConfig } from '$lib/server/auth/zitadel';
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

	const config = getZitadelAuthConfig(privateEnv);
	throw redirect(302, await buildLogoutUrl(config, session?.idToken));
};
