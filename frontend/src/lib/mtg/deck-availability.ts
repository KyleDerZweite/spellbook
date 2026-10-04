export interface DeckAvailability {
	exact: number;
	alternate: number;
	missing: number;
}

export interface DeckAvailabilityResponse {
	deckId: string;
	entries: Array<DeckAvailability & { entryId: string; required: number }>;
	totals: DeckAvailability & { required: number };
}

interface CardQuantity {
	catalogCardId: string;
	canonicalCardId: string;
	quantity: number;
}

export function allocateDeckAvailability(
	deckCards: readonly (CardQuantity & { id: string })[],
	inventoryCards: readonly CardQuantity[]
): Record<string, DeckAvailability> {
	const orderedCards = [...deckCards].sort((a, b) => a.id.localeCompare(b.id));
	const remaining = new Map<string, { canonicalCardId: string; quantity: number }>();
	for (const card of inventoryCards) {
		const existing = remaining.get(card.catalogCardId);
		remaining.set(card.catalogCardId, {
			canonicalCardId: card.canonicalCardId,
			quantity: (existing?.quantity ?? 0) + card.quantity
		});
	}
	const result: Record<string, DeckAvailability> = {};
	for (const card of orderedCards) {
		const owned = remaining.get(card.catalogCardId);
		const exact = Math.min(card.quantity, owned?.quantity ?? 0);
		if (owned) owned.quantity -= exact;
		result[card.id] = { exact, alternate: 0, missing: card.quantity - exact };
	}
	for (const card of orderedCards) {
		const allocation = result[card.id];
		for (const owned of remaining.values()) {
			if (!allocation.missing) break;
			if (owned.canonicalCardId !== card.canonicalCardId) continue;
			const alternate = Math.min(allocation.missing, owned.quantity);
			owned.quantity -= alternate;
			allocation.alternate += alternate;
			allocation.missing -= alternate;
		}
	}
	return result;
}
