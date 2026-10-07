import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { readJsonObject } from '#lib/server/http/request.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';
export const POST: RequestHandler = async (event) => {
	try {
		const auth = await requireMobileAuth(event);
		const input = await readJsonObject(event.request);
		return json(await application.valuation.inventoryReferences(auth.user, input), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (cause) {
		priceReadError(cause);
	}
};
