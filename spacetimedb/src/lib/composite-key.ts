export const VALID_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type Condition = typeof VALID_CONDITIONS[number];
export const VALID_FINISHES = ['nonfoil', 'foil'] as const;
export type Finish = typeof VALID_FINISHES[number];

/**
 * Generates a deterministic key for an owned inventory entry.
 * Format: "${inventoryId}_${catalogCardId}_${finish}_${condition}"
 */
export function makeInventoryCardId(
  inventoryId: string,
  catalogCardId: string,
  finish: string,
  condition: string,
): string {
  return `${inventoryId}_${catalogCardId}_${finish}_${condition}`;
}

/**
 * Generates a deterministic key for a deck entry.
 * Format: "${deckId}_${catalogCardId}_${role}"
 */
export function makeDeckCardId(
  deckId: string,
  catalogCardId: string,
  role: string,
): string {
  return `${deckId}_${catalogCardId}_${role}`;
}
