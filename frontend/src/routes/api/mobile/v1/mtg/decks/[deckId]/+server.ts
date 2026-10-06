import type { RequestHandler } from './$types';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readString, readJsonObject, requireUuid } from '#lib/server/http/request.ts';
import { application } from '#lib/server/composition.ts';
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
				...(body.name === undefined ? {} : { name: readString(body.name, 'name') }),
				...(body.description === undefined
					? {}
					: {
							description: readString(body.description, 'description'),
							descriptionRevision: readString(body.descriptionRevision, 'descriptionRevision', '')
						}),
				...(body.format === undefined ? {} : { format: readString(body.format, 'format') })
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const DELETE: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const deckId = requireUuid(event.params.deckId, 'deckId');

	try {
		return json(await deleteDeckEntry(auth, deckId));
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const deckId = requireUuid(event.params.deckId, 'deckId');
		const snapshot = await application.decks.getDeckSnapshot(auth.user, 'mtg', deckId);
		const detail = await application.decks.getDeckLegality(auth.user, deckId);
		return json({ ...snapshot, ...detail });
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
