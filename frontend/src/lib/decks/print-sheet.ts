import type { DeckCard, DeckRole } from '@spellbook/contracts/decks.ts';

/** Nine real-size cards (3 columns × 3 rows) fit one DIN A4 portrait page. */
export const cardsPerPrintPage = 9;

export interface PrintCopy {
	key: string;
	name: string;
	imageUri: string;
}

const roleOrder: readonly DeckRole[] = ['commander', 'main', 'sideboard', 'companion'];
const roleRank = (role: string) => {
	const rank = roleOrder.indexOf(role as DeckRole);
	return rank === -1 ? roleOrder.length : rank;
};

/** Expands every Deck entry into one printed copy per required quantity, in Deck role order. */
export function printCopies(
	cards: readonly Pick<DeckCard, 'id' | 'name' | 'imageUri' | 'quantity' | 'role'>[]
): PrintCopy[] {
	return [...cards]
		.sort((a, b) => roleRank(a.role) - roleRank(b.role))
		.flatMap((card) =>
			Array.from({ length: card.quantity }, (_, copy) => ({
				key: `${card.id}:${copy}`,
				name: card.name,
				imageUri: card.imageUri
			}))
		);
}

/** Splits printed copies into full pages; only the last page may be partly filled. */
export function printPages<T>(copies: readonly T[], perPage = cardsPerPrintPage): T[][] {
	const pages: T[][] = [];
	for (let start = 0; start < copies.length; start += perPage)
		pages.push(copies.slice(start, start + perPage));
	return pages;
}
