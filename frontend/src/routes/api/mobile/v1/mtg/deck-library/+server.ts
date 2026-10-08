import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { readLibraryInput } from './input.server.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(
			await application.decks.getDeckLibrary(auth.user, readLibraryInput(event.url.searchParams))
		);
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
