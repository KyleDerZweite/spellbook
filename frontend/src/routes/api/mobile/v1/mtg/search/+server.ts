import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { searchCatalog } from '$lib/server/mobile/meilisearch';

export const GET = async (event) => {
	await requireMobileAuth(event);
	const query = event.url.searchParams.get('q') ?? '';
	const limit = Number(event.url.searchParams.get('limit') ?? '20');
	const offset = Number(event.url.searchParams.get('offset') ?? '0');
	return json(await searchCatalog(query, limit, offset));
};
