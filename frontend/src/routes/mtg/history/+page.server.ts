import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { application } from '#lib/server/composition.ts';
import { valueHistoryQuery } from '#lib/server/mobile/value-history-query.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';
export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) error(401, 'Sign in to view Inventory history.');
	const query = valueHistoryQuery(url.searchParams);
	const printingName = query.printingId
		? await application.catalog
				.getCatalogPrinting(query.printingId)
				.then((card) => card.name)
				.catch(() => 'Selected printing')
		: '';
	try {
		return {
			history: await application.inventoryValues.history(locals.user, query),
			historyError: '',
			query,
			printingName
		};
	} catch (cause) {
		if (cause instanceof Error && cause.name === 'ValidationError') priceReadError(cause);
		return {
			history: null,
			historyError: 'Inventory history could not be loaded. Try again.',
			query,
			printingName
		};
	}
};
