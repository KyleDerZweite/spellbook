import type { HttpDependencies, HttpRoute } from '../types.ts';
import { json, badRequestIfValidation } from '../errors.ts';
import { requireMobileAuth } from '../auth.ts';
import { readJsonObject, readQueryInteger, requireUuid } from '../request.ts';
import { parseCatalogSearchRequest } from '../../catalog/query.ts';

export function createCatalogRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	const searchGet: HttpRoute['handle'] = async (context) => {
		try {
			const input = parseCatalogSearchRequest({
				query: context.url.searchParams.get('q') ?? '',
				limit: readQueryInteger(context.url.searchParams.get('limit'), 'limit', 20, 500),
				offset: readQueryInteger(context.url.searchParams.get('offset'), 'offset', 0, 1000000)
			});
			return json(await application.catalog.searchCatalogRequest(input), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (cause) {
			badRequestIfValidation(cause, 'Invalid catalog search');
		}
	};
	const mobileSearchGet: HttpRoute['handle'] = async (context) => {
		await requireMobileAuth(context, deps);
		return searchGet(context);
	};
	const searchPost: HttpRoute['handle'] = async (context) => {
		try {
			const input = parseCatalogSearchRequest(await readJsonObject(context.request));
			return json(await application.catalog.searchCatalogRequest(input), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (cause) {
			badRequestIfValidation(cause, 'Invalid catalog search');
		}
	};
	const mobileSearchPost: HttpRoute['handle'] = async (context) => {
		await requireMobileAuth(context, deps);
		return searchPost(context);
	};
	const printingsGet: HttpRoute['handle'] = async (context) => {
		const oracleId = requireUuid(context.params.oracleId, 'oracleId');
		const limit = readQueryInteger(context.url.searchParams.get('limit'), 'limit', 100, 100, 1);
		const offset = readQueryInteger(context.url.searchParams.get('offset'), 'offset', 0, 1000000);
		return json(await application.catalog.getPrintings(oracleId, limit, offset));
	};
	const mobilePrintingsGet: HttpRoute['handle'] = async (context) => {
		await requireMobileAuth(context, deps);
		return printingsGet(context);
	};
	const printingGet: HttpRoute['handle'] = async (context) => {
		try {
			const printingId = requireUuid(context.params.printingId, 'printingId');
			return json(await application.catalog.getCatalogPrinting(printingId), {
				headers: { 'cache-control': 'no-store' }
			});
		} catch (cause) {
			badRequestIfValidation(cause, 'Invalid catalog printing');
		}
	};
	return [
		{ method: 'GET', path: '/api/catalog/search', handle: searchGet },
		{ method: 'GET', path: '/api/mobile/v1/mtg/search', handle: mobileSearchGet },
		{ method: 'POST', path: '/api/catalog/search', handle: searchPost },
		{ method: 'POST', path: '/api/mobile/v1/mtg/search', handle: mobileSearchPost },
		{ method: 'GET', path: '/api/catalog/cards/:oracleId/printings', handle: printingsGet },
		{
			method: 'GET',
			path: '/api/mobile/v1/mtg/cards/:oracleId/printings',
			handle: mobilePrintingsGet
		},
		{ method: 'GET', path: '/api/catalog/printings/:printingId', handle: printingGet }
	];
}
