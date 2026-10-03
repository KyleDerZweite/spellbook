import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBearerToken, revokeSession } from '$lib/server/auth/session';
import { requireSameOrigin } from '$lib/server/auth/local';
export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event, true);
	const token = getBearerToken(event.request);
	if (!token) error(401, 'Bearer token required');
	await revokeSession(token);
	return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
};
