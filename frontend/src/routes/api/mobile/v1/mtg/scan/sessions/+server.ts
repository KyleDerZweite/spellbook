import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { createScanSessionEntry } from '$lib/server/mobile/postgres';

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = crypto.randomUUID();
	return json({
		session: await createScanSessionEntry(auth, sessionId)
	});
};
