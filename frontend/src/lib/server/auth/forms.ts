import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { authenticate, requireSameOrigin, sanitizeReturnTo, takeAuthAttempt } from './local';
import { revokeSession, SESSION_COOKIE, writeSessionCookie } from './session';

export async function submitAuthForm(event: RequestEvent, mode: 'login' | 'register') {
	requireSameOrigin(event);
	takeAuthAttempt(event.getClientAddress());
	const data = await event.request.formData();
	const username = data.get('username');
	const artworkId = data.get('artworkId');
	const preferences = data.has('artworkId') ? { artworkId } : {};
	const authenticated = await authenticate(mode, username, data.get('password'), preferences);
	if (!authenticated)
		return fail(400, {
			message:
				mode === 'login'
					? 'Invalid username or password.'
					: 'Unable to create an account with those details.',
			username: typeof username === 'string' ? username : '',
			...(mode === 'register' ? { artworkId: typeof artworkId === 'string' ? artworkId : '' } : {})
		});
	await revokeSession(event.cookies.get(SESSION_COOKIE));
	const { session } = authenticated;
	writeSessionCookie(event.cookies, session.token, event.url);
	redirect(303, sanitizeReturnTo(event.url.searchParams.get('returnTo')));
}
