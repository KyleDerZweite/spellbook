import type { RequestHandler } from './$types';
import { readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { ScanAccessError, submitScanResult } from '#lib/server/data/scan.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const sessionId = requireUuid(event.params.sessionId, 'sessionId');
	const artifactId = requireUuid(event.params.artifactId, 'artifactId');
	const body = await readJsonObject(event.request);

	try {
		return json(await submitScanResult(auth.user.accountId, sessionId, artifactId, body), {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (cause) {
		if (cause instanceof ScanAccessError) error(cause.status, cause.message);
		badRequestIfValidation(cause);
	}
};
