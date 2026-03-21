/**
 * Generates a deterministic composite key for CollectionCard.
 * Format: "${collectionId}_${scryfallId}_${isFoil}_${condition}"
 *
 * This enforces uniqueness at the DB level since SpacetimeDB
 * does not support multi-column unique constraints.
 */
export function makeCompositeId(
  collectionId: string,
  scryfallId: string,
  isFoil: boolean,
  condition: string,
): string {
  return `${collectionId}_${scryfallId}_${isFoil}_${condition}`;
}

export const VALID_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type Condition = typeof VALID_CONDITIONS[number];
