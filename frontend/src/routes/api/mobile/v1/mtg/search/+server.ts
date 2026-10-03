import { readQueryInteger } from '$lib/server/http/request';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { searchCatalog } from '$lib/server/mobile/meilisearch';

export const GET = async (event) => {
	await requireMobileAuth(event);
	const query = event.url.searchParams.get('q') ?? '';
	const limit = readQueryInteger(event.url.searchParams.get('limit'), 'limit', 20, 100);
	const offset = readQueryInteger(event.url.searchParams.get('offset'), 'offset', 0);
	return json(await searchCatalog(query, limit, offset));
};
