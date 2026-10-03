import { readJsonObject } from '#lib/server/http/request.ts';
import { error, json, type RequestEvent } from '@sveltejs/kit';
import { authenticate, requireSameOrigin, takeAuthAttempt } from './local';

export async function authenticateApi(event: RequestEvent, mode: 'login' | 'register') {
	requireSameOrigin(event, true);
	takeAuthAttempt(event.getClientAddress());
	const body = await readJsonObject(event.request);
	const { username, password } = body as Record<string, unknown>;
	const authenticated = await authenticate(mode, username, password);
	if (!authenticated)
		error(
			mode === 'login' ? 401 : 400,
			mode === 'login'
				? 'Invalid username or password'
				: 'Unable to create an account with those details'
		);
	const { user, session } = authenticated;
	return json(
		{ user, token: session.token, expiresAt: session.expiresAt.toISOString() },
		{
			status: mode === 'register' ? 201 : 200,
			headers: { 'Cache-Control': 'no-store' }
		}
	);
}
