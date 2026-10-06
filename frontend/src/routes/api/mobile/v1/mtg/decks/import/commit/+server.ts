import type { RequestHandler } from './$types';
import { readString, readJsonObject } from '#lib/server/http/request.ts';
import { json } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
export const POST: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	const body = await readJsonObject(event.request);
	try {
		return json(
			await application.decks.importTextDeck(auth.user, {
				requestId: readString(body.requestId, 'requestId', ''),
				source: readString(body.source, 'source', 'import'),
				game: 'mtg',
				name: readString(body.name, 'name', ''),
				description: readString(body.description, 'description', ''),
				format: readString(body.format, 'format', 'Commander'),
				text: readString(body.text, 'text', '')
			})
		);
	} catch (cause) {
		badRequestIfValidation(cause, 'Invalid deck import commit');
	}
};
