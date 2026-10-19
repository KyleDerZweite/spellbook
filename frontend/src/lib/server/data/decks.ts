import { application } from '#lib/server/composition.ts';
export const { createDeckRecord, updateDeck, deleteDeck, updateDeckCard, removeDeckCard } =
	application.decks;
export { DescriptionConflictError, DeckNotFoundError } from '#lib/server/remote/errors.ts';
