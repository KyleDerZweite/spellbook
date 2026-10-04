import type { RequestHandler } from './$types';
import { requireUuid } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { getScanSessionResultEntry } from '#lib/server/mobile/mtg-service.ts';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = requireUuid(event.params.sessionId, 'sessionId');

	const result = await getScanSessionResultEntry(auth, sessionId);
	if (!result.session) error(404, 'Scan session not found');
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
