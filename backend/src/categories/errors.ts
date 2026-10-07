import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
export class CategoryNotFound extends Error {
	readonly kind = 'NotFound';
	constructor() {
		super('Deck, entry or category not found');
	}
}
export class CategoryConflict extends Error {
	readonly kind = 'CategoryConflict';
	constructor(readonly latest: DeckEntryCategories) {
		super('Category decision changed. Review the latest saved decision.');
	}
}
