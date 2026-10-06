import type { InventoryEntry } from '@spellbook/contracts/inventory.ts';

/** Capture each rendered entry so teardown callbacks never re-read an evicted cache slot. */
export function inventoryRowSlots(
	queryKey: string,
	indexes: readonly number[],
	entryAt: (index: number) => InventoryEntry | undefined
) {
	return indexes.map((index) => {
		const entry = entryAt(index);
		return { queryKey, index, entry, key: JSON.stringify([queryKey, index, entry?.id ?? null]) };
	});
}
export type InventoryRowSlot = ReturnType<typeof inventoryRowSlots>[number];
