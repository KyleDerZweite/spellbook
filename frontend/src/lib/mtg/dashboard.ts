import { allocateDeckAvailability } from './deck-availability';
import type { Deck, DeckCard, InventoryCard } from '#lib/types/legacy.ts';

type OwnedEntry = Pick<
	InventoryCard,
	| 'id'
	| 'catalogCardId'
	| 'canonicalCardId'
	| 'name'
	| 'setCode'
	| 'imageUri'
	| 'quantity'
	| 'finish'
	| 'condition'
	| 'updatedAt'
>;
type DeckEntry = Pick<DeckCard, 'id' | 'deckId' | 'catalogCardId' | 'canonicalCardId' | 'quantity'>;
type AccountDeck = Pick<Deck, 'id' | 'name' | 'format'>;

export function summarizeDashboard(
	cards: readonly OwnedEntry[],
	decks: readonly AccountDeck[],
	deckCards: readonly DeckEntry[]
) {
	const total = cards.reduce((sum, card) => sum + card.quantity, 0);
	const sets = new Map<string, number>();
	const finishes = new Map<string, number>([
		['nonfoil', 0],
		['foil', 0]
	]);
	const conditions = new Map<string, number>(
		['NM', 'LP', 'MP', 'HP', 'DMG'].map((condition) => [condition, 0])
	);
	for (const card of cards) {
		sets.set(card.setCode, (sets.get(card.setCode) ?? 0) + card.quantity);
		finishes.set(card.finish, (finishes.get(card.finish) ?? 0) + card.quantity);
		conditions.set(card.condition, (conditions.get(card.condition) ?? 0) + card.quantity);
	}
	const distribution = (values: Map<string, number>) =>
		[...values].map(([label, quantity]) => ({
			label,
			quantity,
			share: total ? quantity / total : 0
		}));
	return {
		totals: {
			total,
			names: new Set(cards.map((card) => card.canonicalCardId)).size,
			printings: new Set(cards.map((card) => card.catalogCardId)).size,
			sets: sets.size,
			decks: decks.length,
			foils: finishes.get('foil') ?? 0
		},
		sets: distribution(sets).sort(
			(a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label)
		),
		finishes: distribution(finishes),
		conditions: distribution(conditions),
		recentEntries: [...cards]
			.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id))
			.slice(0, 8),
		decks: decks.map((deck) => {
			const entries = deckCards.filter((card) => card.deckId === deck.id);
			const allocations = Object.values(allocateDeckAvailability(entries, cards));
			return {
				...deck,
				required: entries.reduce((sum, card) => sum + card.quantity, 0),
				exact: allocations.reduce((sum, item) => sum + item.exact, 0),
				alternate: allocations.reduce((sum, item) => sum + item.alternate, 0),
				missing: allocations.reduce((sum, item) => sum + item.missing, 0)
			};
		})
	};
}
