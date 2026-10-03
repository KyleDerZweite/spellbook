import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	allocateDeckAvailability,
	type DeckAvailabilityResponse
} from '$lib/mtg/deck-availability';
import { getDeckSnapshot } from '$lib/server/data/decks';
import { requireMobileAuth } from '$lib/server/mobile/auth';
import { badRequestIfValidation } from '$lib/server/mobile/route-errors';
import { requireUuid } from '$lib/server/http/request';

export const GET: RequestHandler = async (event) => {
	const auth = await requireMobileAuth(event);
	try {
		const deckId = requireUuid(event.params.deckId, 'deckId');
		const snapshot = await getDeckSnapshot(auth.user.accountId, 'mtg');
		if (!snapshot.decks.some((deck) => deck.id === deckId)) error(404, 'Deck not found');
		const cards = snapshot.deckCards
			.filter((card) => card.deckId === deckId)
			.sort((a, b) => a.id.localeCompare(b.id));
		const allocations = allocateDeckAvailability(cards, snapshot.inventoryCards);
		const entries = cards.map((card) => ({
			entryId: card.id,
			required: card.quantity,
			...allocations[card.id]
		}));
		const totals = entries.reduce(
			(sum, entry) => ({
				required: sum.required + entry.required,
				exact: sum.exact + entry.exact,
				alternate: sum.alternate + entry.alternate,
				missing: sum.missing + entry.missing
			}),
			{ required: 0, exact: 0, alternate: 0, missing: 0 }
		);
		const response: DeckAvailabilityResponse = { deckId, entries, totals };
		return json(response, { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		badRequestIfValidation(cause, 'Unable to calculate deck availability');
	}
};
