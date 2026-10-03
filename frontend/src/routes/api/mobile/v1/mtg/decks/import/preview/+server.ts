import { readString, readJsonObject } from '$lib/server/http/request';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { previewMtgImport } from '$lib/server/mtg/import';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await previewMtgImport(
				readString(body.text, 'text', ''),
				readString(body.format, 'format', '')
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck import preview');
	}
};
