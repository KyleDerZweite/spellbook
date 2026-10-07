import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';
export const GET: RequestHandler = async ({ url }) => {
	if (
		[...url.searchParams.keys()].some((k) => k !== 'printingId' && k !== 'finish') ||
		url.searchParams.getAll('printingId').length !== 1 ||
		url.searchParams.getAll('finish').length !== 1
	)
		error(400, 'Supply one printingId and finish');
	try {
		return json(
			await application.valuation.printingReferences([
				{ printingId: url.searchParams.get('printingId'), finish: url.searchParams.get('finish') }
			]),
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (cause) {
		priceReadError(cause);
	}
};
