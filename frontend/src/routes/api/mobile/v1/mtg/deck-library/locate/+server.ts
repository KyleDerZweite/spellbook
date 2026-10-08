import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { requireUuid } from '#lib/server/http/request.ts';
import { readLibraryInput } from '../input.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			await application.decks.locateDeck(
				auth.user,
				requireUuid(event.url.searchParams.get('deckId')),
				readLibraryInput(event.url.searchParams)
			)
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
