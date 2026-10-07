import type { RequestHandler } from './$types';
import { requireUuid } from '#lib/server/http/request.ts';
import { json, error } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const raw = event.url.searchParams.get('limit');
	if (raw !== null && !/^\d+$/.test(raw)) error(400, 'Invalid Scan page limit');
	try {
		return json(
			await application.scan.readSession(auth.user, {
				sessionId: requireUuid(event.params.sessionId, 'sessionId'),
				limit: raw === null ? undefined : Number(raw),
				artifactCursor: event.url.searchParams.get('artifactCursor') ?? undefined,
				reviewCursor: event.url.searchParams.get('reviewCursor') ?? undefined
			}),
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
