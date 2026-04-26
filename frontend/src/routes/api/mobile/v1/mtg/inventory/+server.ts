import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { getInventorySnapshotEntry, batchAddInventory } from '$lib/server/mobile/postgres';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getInventorySnapshotEntry(auth));
};

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	if (!body?.requestId || !Array.isArray(body?.items)) {
		throw error(400, 'requestId and items are required');
	}

	return json(
		await batchAddInventory(auth, {
			requestId: String(body.requestId),
			source: String(body.source ?? 'mobile'),
			items: body.items
		})
	);
};
