import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { createDeckEntry, getDeckSnapshotEntry } from '$lib/server/mobile/postgres';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getDeckSnapshotEntry(auth));
};

export const POST = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await event.request.json();
	if (!body?.name) {
		throw error(400, 'name is required');
	}

	return json(
		await createDeckEntry(auth, {
			name: String(body.name),
			description: String(body.description ?? ''),
			format: String(body.format ?? 'Commander')
		})
	);
};
