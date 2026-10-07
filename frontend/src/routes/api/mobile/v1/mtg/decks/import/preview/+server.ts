import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { application } from '#lib/server/composition.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.decks.previewMtgImport(
				auth.user,
				readString(body.text, 'text', ''),
				readString(body.format, 'format', '')
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck import preview');
	}
};
