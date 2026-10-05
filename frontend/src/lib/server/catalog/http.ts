import type { RequestHandler } from '@sveltejs/kit';
import { readJsonObject, readQueryInteger, requireUuid } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { searchCatalogRequest, getPrintings } from '#lib/server/catalog/search.ts';
import { parseCatalogSearchRequest } from '#lib/server/catalog/query.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const searchGet: RequestHandler = async (event) => {
	try {
		const input = parseCatalogSearchRequest({
			query: event.url.searchParams.get('q') ?? '',
			limit: readQueryInteger(event.url.searchParams.get('limit'), 'limit', 20, 100),
			offset: readQueryInteger(event.url.searchParams.get('offset'), 'offset', 0, 1000000)
		});
		return json(await searchCatalogRequest(input), { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid catalog search');
	}
};

export const searchPost: RequestHandler = async (event) => {
	try {
		const input = parseCatalogSearchRequest(await readJsonObject(event.request));
		return json(await searchCatalogRequest(input), { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid catalog search');
	}
};

export const printingsGet: RequestHandler = async (event) => {
	const oracleId = requireUuid(event.params.oracleId, 'oracleId');
	const limit = readQueryInteger(event.url.searchParams.get('limit'), 'limit', 100, 100, 1);
	const offset = readQueryInteger(event.url.searchParams.get('offset'), 'offset', 0, 1000000);
	return json(await getPrintings(oracleId, limit, offset));
};
