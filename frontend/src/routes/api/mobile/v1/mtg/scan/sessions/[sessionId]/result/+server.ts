import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getScanSessionResult } from '$lib/server/mobile/spacetimedb';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = event.params.sessionId?.trim();
	if (!sessionId) {
		throw error(400, 'sessionId is required');
	}

	return json(await getScanSessionResult(auth, sessionId));
};
