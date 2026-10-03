import { requireUuid } from '$lib/server/http/request';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getScanSessionResultEntry } from '$lib/server/mobile/mtg-service';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = requireUuid(event.params.sessionId, 'sessionId');

	const result = await getScanSessionResultEntry(auth, sessionId);
	if (!result.session) error(404, 'Scan session not found');
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
