import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

let cachedSearchKey: string | null = null;

/**
 * Fetch the default search API key from MeiliSearch by listing keys
 * and finding the one named "Default Search API Key".
 * Caches the result so it's only fetched once per server lifetime.
 */
async function getMeiliSearchKey(): Promise<string> {
	if (cachedSearchKey) return cachedSearchKey;

	const internalUrl = env.MEILISEARCH_INTERNAL_URL ?? 'http://localhost:7700';
	const masterKey = env.MEILI_MASTER_KEY;

	if (!masterKey) {
		console.warn('MEILI_MASTER_KEY not set — MeiliSearch search key cannot be fetched');
		return '';
	}

	try {
		const res = await fetch(`${internalUrl}/keys?limit=100`, {
			headers: { Authorization: `Bearer ${masterKey}` }
		});

		if (!res.ok) {
			console.error(`Failed to fetch MeiliSearch keys: ${res.status} ${res.statusText}`);
			return '';
		}

		const data = await res.json();
		const searchKey = data.results?.find(
			(k: { name: string; actions: string[] }) =>
				k.name === 'Default Search API Key' || (k.actions?.length === 1 && k.actions[0] === 'search')
		);

		if (!searchKey?.key) {
			console.error('MeiliSearch default search key not found in /keys response');
			return '';
		}

		cachedSearchKey = searchKey.key;
		return cachedSearchKey!;
	} catch (err) {
		console.error('Failed to connect to MeiliSearch:', err);
		return '';
	}
}

/**
 * Read Pangolin IAP headers for user identity.
 * Falls back to dev defaults when headers are absent.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const accountId =
		event.request.headers.get('Remote-Subject') ?? 'dev-user-001';
	const username =
		event.request.headers.get('Remote-User') ?? 'dev';
	const email =
		event.request.headers.get('Remote-Email') ?? 'dev@localhost';

	event.locals.user = { accountId, username, email };
	event.locals.meiliSearchKey = await getMeiliSearchKey();

	return resolve(event);
};
