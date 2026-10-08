import { application } from '#lib/server/composition.ts';
export const {
	getRecentDecks,
	getDeckSnapshot,
	createDeckRecord,
	updateDeck,
	deleteDeck,
	addDeckCard,
	updateDeckCard,
	removeDeckCard,
	bulkMutateDeckCards,
	getDeckCardsForDeck,
	importDeck
} = application.decks;
export async function createDeck(
	actor: import('@spellbook/contracts/auth.ts').AuthUser,
	input: Parameters<typeof createDeckRecord>[1]
) {
	return (await getDeckSnapshot(actor, input.game)).decks.concat(
		await createDeckRecord(actor, input)
	);
}
export { DescriptionConflictError, DeckNotFoundError } from '@spellbook/backend/transport.ts';
