import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { application } from '#lib/server/composition.ts';
import { assertCondition, assertFinish } from '#lib/server/mtg/validation.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		assertFinish(body?.defaultFinish ?? 'nonfoil');
		assertCondition(body?.defaultCondition ?? 'NM');
		return json(
			await application.inventory.previewImport(auth.user, readString(body.text, 'text', ''))
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid inventory import preview');
	}
};
