import type { RequestHandler } from './$types';
import { readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import type { ScanCommitInput } from '@spellbook/contracts/scan.ts';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { scanHttpError } from '#lib/server/mobile/scan.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	// Explicit legacy verification is accepted only by Backend's existing-receipt path.
	try {
		return json(
			await application.scan.commitReview(
				auth.user,
				body as unknown as ScanCommitInput,
				event.request.signal
			),
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (cause) {
		scanHttpError(cause);
	}
};
