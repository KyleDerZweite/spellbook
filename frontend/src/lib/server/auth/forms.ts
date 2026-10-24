import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { AuthSession, AuthUser } from '@spellbook/contracts/auth.ts';
import { requireSameOrigin, sanitizeReturnTo } from './local';
import { revokeSession, SESSION_COOKIE, writeSessionCookie } from './session';
import { RemoteError } from '#lib/server/remote/errors.ts';
import type { WebFormPath } from '#lib/server/remote/client.ts';

interface AuthFormSuccess extends AuthSession {
	user: AuthUser;
}
interface AuthFormFailure {
	message: string;
	username: string;
	artworkId?: string;
}
export interface PasswordFormFailure {
	success: false;
	message: string;
	errors: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
}
export interface PasswordFormSuccess extends AuthSession {
	success: true;
}

/** Forward before decoding so the API consumes exactly one auth attempt for every form. */
export async function submitCredentialForm<Success, Failure>(
	event: RequestEvent,
	path: WebFormPath
) {
	try {
		return await event.locals.api.form<Success, Failure>(path, event.request);
	} catch (cause) {
		if (cause instanceof RemoteError) error(cause.status, cause.message);
		throw cause;
	}
}

export async function submitAuthForm(event: RequestEvent, mode: 'login' | 'register') {
	requireSameOrigin(event);
	const result = await submitCredentialForm<AuthFormSuccess, AuthFormFailure>(
		event,
		`/api/v1/web/auth/${mode}`
	);
	if (!result.ok) return fail(result.status, result.data);
	await revokeSession(event.cookies.get(SESSION_COOKIE));
	writeSessionCookie(event.cookies, result.data.token, event.url);
	redirect(303, sanitizeReturnTo(event.url.searchParams.get('returnTo')));
}
