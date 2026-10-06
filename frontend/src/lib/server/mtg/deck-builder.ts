import { application } from '#lib/server/composition.ts';
export const {
	addCatalogCardToDeck,
	importIntoDeck,
	getDeckLegality,
	exportDecklist,
	changeDeckPrinting
} = application.decks;
