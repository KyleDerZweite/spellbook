import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getScanSessionResultEntry } from '$lib/server/mobile/postgres';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = event.params.sessionId?.trim();
	if (!sessionId) {
		throw error(400, 'sessionId is required');
	}

	return json(await getScanSessionResultEntry(auth, sessionId));
};
