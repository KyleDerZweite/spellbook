import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			{ session: await application.scan.createSession(auth.user) },
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			{ sessions: await application.scan.listSessions(auth.user) },
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
