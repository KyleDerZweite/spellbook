import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { removeDeckCardEntry, updateDeckCardEntry } from '$lib/server/mobile/postgres';

export const PATCH = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = event.params.entryId?.trim();
	const body = await event.request.json();
	if (!entryId) {
		throw error(400, 'entryId is required');
	}

	return json(await updateDeckCardEntry(auth, entryId, Number(body?.quantity ?? 1)));
};

export const DELETE = async (event) => {
	const auth = await requireMobileAuth(event);
	const entryId = event.params.entryId?.trim();
	if (!entryId) {
		throw error(400, 'entryId is required');
	}

	return json(await removeDeckCardEntry(auth, entryId));
};
