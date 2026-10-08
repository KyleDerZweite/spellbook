import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';
import { valueHistoryQuery } from '#lib/server/mobile/value-history-query.ts';
export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const actor = await requireMobileAuth(event);

	try {
		return json(
			await application.inventoryValues.history(
				actor.user,
				valueHistoryQuery(event.url.searchParams)
			),
			{ headers: { 'cache-control': 'private, no-store' } }
		);
	} catch (cause) {
		priceReadError(cause);
	}
};
