import { deckLibraryQueryFromParams } from '@spellbook/contracts/deck-library.ts';
import { readQueryInteger } from '#lib/server/http/request.ts';
import { error } from '@sveltejs/kit';
export function readLibraryInput(params: URLSearchParams) {
	try {
		return {
			...deckLibraryQueryFromParams(params),
			offset: readQueryInteger(params.get('offset'), 'offset', 0),
			limit: readQueryInteger(params.get('limit'), 'limit', 40),
			...((params.get('expectedRevision') ?? params.get('revision')) === null
				? {}
				: { expectedRevision: (params.get('expectedRevision') ?? params.get('revision'))! })
		};
	} catch {
		throw error(400, 'Invalid Deck Library query');
	}
}
