import type { Collection, CollectionCard, UserProfile } from '$bindings/types';

/**
 * Reactive state synchronized from SpacetimeDB subscriptions.
 * Uses Svelte 5 $state runes for reactivity.
 */
class SpacetimeState {
	collections: Collection[] = $state([]);
	collectionCards: CollectionCard[] = $state([]);
	userProfile: UserProfile | null = $state(null);
	connected: boolean = $state(false);
	error: string | null = $state(null);

	/** Get cards belonging to a specific collection. */
	getCardsForCollection(collectionId: string): CollectionCard[] {
		return this.collectionCards.filter((c) => c.collectionId === collectionId);
	}

	/** Get a collection by its ID. */
	getCollection(id: string): Collection | undefined {
		return this.collections.find((c) => c.id === id);
	}

	/** Stats for a specific collection. */
	getCollectionStats(collectionId: string): { total: number; unique: number; foils: number } {
		const cards = this.getCardsForCollection(collectionId);
		const total = cards.reduce((sum, c) => sum + c.quantity, 0);
		const unique = cards.length;
		const foils = cards.filter((c) => c.isFoil).length;
		return { total, unique, foils };
	}

	/** Global stats across all collections. */
	get globalStats(): { totalCards: number; uniqueCards: number; totalCollections: number } {
		const totalCards = this.collectionCards.reduce((sum, c) => sum + c.quantity, 0);
		const uniqueOracleIds = new Set(this.collectionCards.map((c) => c.oracleId));
		return {
			totalCards,
			uniqueCards: uniqueOracleIds.size,
			totalCollections: this.collections.length
		};
	}
}

export const spacetimeState = new SpacetimeState();
