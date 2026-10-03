import type { RequestHandler } from './$types';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readString, readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { deleteDeckEntry, updateDeckEntry } from '#lib/server/mobile/mtg-service.ts';

export const PATCH: RequestHandler = async (event) => {
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

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');

	return json(await deleteDeckEntry(auth, deckId));
};
