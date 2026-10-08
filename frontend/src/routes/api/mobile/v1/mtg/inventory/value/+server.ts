import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';

export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const actor = await requireMobileAuth(event);
	if (event.url.search) error(400, 'Current value accepts no query parameters');
	try {
		return json(await application.inventoryValues.current(actor.user));
	} catch (cause) {
		priceReadError(cause);
	}
};
