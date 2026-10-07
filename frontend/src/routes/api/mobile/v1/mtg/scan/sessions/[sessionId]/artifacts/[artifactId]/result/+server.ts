import type { RequestHandler } from './$types';
import { readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
import type { ScanStatus } from '@spellbook/contracts/scan.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.scan.submitResult(auth.user, {
				sessionId: requireUuid(event.params.sessionId, 'sessionId'),
				artifactId: requireUuid(event.params.artifactId, 'artifactId'),
				status: body.status as ScanStatus,
				modelVersion: body.modelVersion as string,
				candidates: body.candidates as {
					catalogCardId: string;
					confidence: number;
					notes?: string;
				}[]
			}),
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
