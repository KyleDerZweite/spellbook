import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		return json(await application.decks.search(auth.user, event.url.searchParams.get('q') || ''));
	} catch (cause) {
		badRequestIfValidation(cause);
	}
};
