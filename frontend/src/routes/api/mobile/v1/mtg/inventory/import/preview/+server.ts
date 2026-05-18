import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { previewMtgImport } from '$lib/server/mtg/import';
import { assertCondition, assertFinish } from '$lib/server/mtg/validation';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';

export const POST = async (event) => {
	await requireMobileAuth(event);
	const body = await event.request.json();
	try {
		assertFinish(body?.defaultFinish ?? 'nonfoil');
		assertCondition(body?.defaultCondition ?? 'NM');
		return json(await previewMtgImport(String(body?.text ?? '')));
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid inventory import preview');
	}
};
