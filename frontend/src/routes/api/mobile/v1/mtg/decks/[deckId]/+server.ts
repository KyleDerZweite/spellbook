import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { readString, readJsonObject, requireUuid } from '$lib/server/http/request';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { deleteDeckEntry, updateDeckEntry } from '$lib/server/mobile/mtg-service';

export const PATCH = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');
	const body = await readJsonObject(event.request);

	try {
		return json(
			await updateDeckEntry(auth, {
				deckId,
				name: readString(body.name, 'name', ''),
				description: readString(body.description, 'description', ''),
				format: readString(body.format, 'format', 'Commander')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const DELETE = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');

	return json(await deleteDeckEntry(auth, deckId));
};
