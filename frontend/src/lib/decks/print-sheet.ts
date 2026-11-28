import type { RelatedToken, RelatedTokenFace } from '@spellbook/contracts/deck-tokens.ts';
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

interface PrintOptions {
	backFaces?: boolean;
	tokens?: readonly (Pick<RelatedToken, 'catalogCardId' | 'name'> & {
		faces: readonly Pick<RelatedTokenFace, 'imageUri'>[];
	})[];
}

export function isPrintableToken(token: RelatedToken): boolean {
	return token.suggestedQuantity > 0 ? token.effectiveQuantity > 0 : token.includeWhenOrphaned;
}

/** Expands Deck quantities, then adds one slot for each selected Related Token. */
export function printCopies(
	cards: readonly Pick<
		DeckCard,
		'id' | 'name' | 'imageUri' | 'quantity' | 'role' | 'backFaceName' | 'backFaceImageUri'
	>[],
	{ backFaces, tokens = [] }: PrintOptions = {}
): PrintCopy[] {
	const copies: PrintCopy[] = [];
	for (const card of [...cards].sort((a, b) => roleRank(a.role) - roleRank(b.role))) {
		for (let copy = 0; copy < card.quantity; copy++) {
			const key = `${card.id}:${copy}`;
			copies.push({ key, name: card.name, imageUri: card.imageUri });
			if (backFaces && card.backFaceImageUri) {
				copies.push({
					key: `${key}:back`,
					name: card.backFaceName || card.name,
					imageUri: card.backFaceImageUri
				});
			}
		}
	}
	for (const token of tokens) {
		copies.push({
			key: `token:${token.catalogCardId}`,
			name: token.name,
			imageUri: token.faces[0]?.imageUri ?? ''
		});
	}
	return copies;
}

/** Splits printed copies into full pages; only the last page may be partly filled. */
export function printPages<T>(copies: readonly T[], perPage = cardsPerPrintPage): T[][] {
	const pages: T[][] = [];
	for (let start = 0; start < copies.length; start += perPage)
		pages.push(copies.slice(start, start + perPage));
	return pages;
}
