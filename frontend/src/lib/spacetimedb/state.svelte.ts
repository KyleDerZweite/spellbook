import type { Deck, DeckCard, Inventory, InventoryCard, UserProfile } from '$bindings/types';
import type { Game } from '$lib/search/types';

const DEFAULT_GAME: Game = 'mtg';

/**
 * Reactive state synchronized from SpacetimeDB subscriptions.
 * Uses Svelte 5 $state runes for reactivity.
 */
class SpacetimeState {
	inventories: Inventory[] = $state([]);
	inventoryCards: InventoryCard[] = $state([]);
	decks: Deck[] = $state([]);
	deckCards: DeckCard[] = $state([]);
	userProfile: UserProfile | null = $state(null);
	connected: boolean = $state(false);
	error: string | null = $state(null);

	reset(clearError = true): void {
		this.inventories = [];
		this.inventoryCards = [];
		this.decks = [];
		this.deckCards = [];
		this.userProfile = null;
		this.connected = false;
		if (clearError) {
			this.error = null;
		}
	}

	getInventory(game: Game = DEFAULT_GAME): Inventory | undefined {
		return this.inventories.find((inventory) => inventory.game === game);
	}

	getInventoryCards(game: Game = DEFAULT_GAME): InventoryCard[] {
		const inventory = this.getInventory(game);
		if (!inventory) {
			return [];
		}

		return this.inventoryCards.filter((card) => card.inventoryId === inventory.id);
	}

	getInventoryStats(game: Game = DEFAULT_GAME): {
		total: number;
		unique: number;
		foils: number;
		sets: number;
		completedSets: number;
	} {
		const cards = this.getInventoryCards(game);
		const total = cards.reduce((sum, c) => sum + c.quantity, 0);
		const unique = new Set(cards.map((c) => c.canonicalCardId)).size;
		const foils = cards.filter((c) => c.finish === 'foil').length;
		const sets = new Set(cards.map((c) => c.setCode)).size;
		return { total, unique, foils, sets, completedSets: 0 };
	}

	getDecks(game: Game = DEFAULT_GAME): Deck[] {
		return this.decks
			.filter((deck) => deck.game === game)
			.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
	}

	getDeck(id: string): Deck | undefined {
		return this.decks.find((deck) => deck.id === id);
	}

	getDeckCards(deckId: string): DeckCard[] {
		return this.deckCards.filter((card) => card.deckId === deckId);
	}

	getOwnedCountForCanonical(canonicalCardId: string, game: Game = DEFAULT_GAME): number {
		return this.getInventoryCards(game)
			.filter((card) => card.canonicalCardId === canonicalCardId)
			.reduce((sum, card) => sum + card.quantity, 0);
	}

	get globalStats(): { totalCards: number; uniqueCards: number; totalDecks: number } {
		const totalCards = this.inventoryCards.reduce((sum, c) => sum + c.quantity, 0);
		const uniqueCanonicalIds = new Set(this.inventoryCards.map((c) => c.canonicalCardId));
		return {
			totalCards,
			uniqueCards: uniqueCanonicalIds.size,
			totalDecks: this.decks.length
		};
	}
}

export const spacetimeState = new SpacetimeState();
