import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getPrintings } from '$lib/server/mobile/meilisearch';

export const GET = async (event) => {
	await requireMobileAuth(event);
	const oracleId = event.params.oracleId?.trim();
	if (!oracleId) {
		throw error(400, 'oracleId is required');
	}

	return json(await getPrintings(oracleId));
};
