import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '#lib/server/auth/session.ts';

export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	await revokeSession(event.cookies.get(SESSION_COOKIE));
	clearSessionCookie(event.cookies);
	redirect(303, '/');
};
