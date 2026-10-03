import type { RequestHandler } from './$types';
import { listScanSessions } from '#lib/server/data/scan.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { createScanSessionEntry } from '#lib/server/mobile/mtg-service.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = crypto.randomUUID();
	return json({
		session: await createScanSessionEntry(auth, sessionId)
	});
};

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(
		{ sessions: await listScanSessions(auth.user.accountId) },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
