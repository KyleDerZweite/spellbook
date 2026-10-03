import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readQueryInteger, requireUuid } from '#lib/server/http/request.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { getPrintings } from '#lib/server/catalog/search.ts';

export const GET: RequestHandler = async (event) => {
	await requireMobileAuth(event);
	const oracleId = requireUuid(event.params.oracleId, 'oracleId');
	const limit = readQueryInteger(event.url.searchParams.get('limit'), 'limit', 100, 100, 1);
	const offset = readQueryInteger(event.url.searchParams.get('offset'), 'offset', 0, 1000000);
	return json(await getPrintings(oracleId, limit, offset));
};
