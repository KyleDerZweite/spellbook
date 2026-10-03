import { json } from '@sveltejs/kit';
import { readQueryInteger, requireUuid } from '$lib/server/http/request';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getPrintings } from '$lib/server/mobile/meilisearch';

export const GET = async (event) => {
	await requireMobileAuth(event);
	const oracleId = requireUuid(event.params.oracleId, 'oracleId');
	const limit = readQueryInteger(event.url.searchParams.get('limit'), 'limit', 100, 100, 1);
	const offset = readQueryInteger(event.url.searchParams.get('offset'), 'offset', 0);
	return json(await getPrintings(oracleId, limit, offset));
};
