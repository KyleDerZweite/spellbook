import type { Cookies } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
export { SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from '#lib/server/remote/client.ts';
import { SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from '#lib/server/remote/client.ts';
export const { validateSession, revokeSession } = application.auth;
export function writeSessionCookie(cookies: Cookies, token: string, url: URL): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: SESSION_LIFETIME_SECONDS
	});
}
export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
export function getBearerToken(request: Request): string | undefined {
	return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
}
