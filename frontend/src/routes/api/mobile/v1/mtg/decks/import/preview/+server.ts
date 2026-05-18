import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { previewMtgImport } from '$lib/server/mtg/import';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	await requireMobileAuth(event);
	const body = await event.request.json();
	try {
		return json(await previewMtgImport(String(body?.text ?? ''), String(body?.format ?? '')));
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck import preview');
	}
};
