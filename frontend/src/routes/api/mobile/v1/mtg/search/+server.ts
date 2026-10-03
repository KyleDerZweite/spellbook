import type { RequestHandler } from './$types';
import { readJsonObject, readQueryInteger } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { searchCatalogRequest } from '#lib/server/catalog/search.ts';
import { parseCatalogSearchRequest } from '#lib/server/catalog/query.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';

export const GET: RequestHandler = async (event) => {
	await requireMobileAuth(event);
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

export const POST: RequestHandler = async (event) => {
	await requireMobileAuth(event);
	try {
		const input = parseCatalogSearchRequest(await readJsonObject(event.request));
		return json(await searchCatalogRequest(input), { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid catalog search');
	}
};
