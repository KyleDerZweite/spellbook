import { error, json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { deleteDeckEntry, updateDeckEntry } from '$lib/server/mobile/postgres';

export const PATCH = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = event.params.deckId?.trim();
	const body = await event.request.json();
	if (!deckId) {
		throw error(400, 'deckId is required');
	}

	return json(
		await updateDeckEntry(auth, {
			deckId,
			name: String(body?.name ?? ''),
			description: String(body?.description ?? ''),
			format: String(body?.format ?? 'Commander')
		})
	);
};

export const DELETE = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = event.params.deckId?.trim();
	if (!deckId) {
		throw error(400, 'deckId is required');
	}

	return json(await deleteDeckEntry(auth, deckId));
};
