import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { createDeckEntry, getDeckSnapshot } from '$lib/server/mobile/spacetimedb';

export const GET = async (event) => {
	const auth = await requireMobileAuth(event);
	return json(await getDeckSnapshot(auth));
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
