import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { priceReadError } from '#lib/server/mobile/price-errors.ts';
export const GET: RequestHandler = async ({ url }) => {
	if (
		[...url.searchParams.keys()].some(
			(key) => !['printingId', 'finish', 'days', 'source'].includes(key)
		) ||
		url.searchParams.getAll('printingId').length !== 1 ||
		url.searchParams.getAll('finish').length !== 1 ||
		url.searchParams.getAll('days').length > 1
	)
		error(400, 'Supply one printingId, finish and optional days/source filters');
	const rawDays = url.searchParams.get('days');
	if (rawDays !== null && !/^[0-9]{1,2}$/.test(rawDays)) error(400, 'History days must be 1 to 90');
	const sources = url.searchParams.getAll('source');
	try {
		return json(
			await application.valuation.printingHistory({
				printingId: url.searchParams.get('printingId'),
				finish: url.searchParams.get('finish'),
				...(rawDays !== null ? { days: Number(rawDays) } : {}),
				...(sources.length ? { sources } : {})
			}),
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (cause) {
		priceReadError(cause);
	}
};
