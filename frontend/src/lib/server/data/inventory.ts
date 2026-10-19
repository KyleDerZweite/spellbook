export {
	InventoryQuantityChangedError,
	InventoryNotFoundError,
	NotesConflictError
} from '#lib/server/remote/errors.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	InventoryAdd,
	InventoryPatch,
	InventoryRemove
} from '@spellbook/contracts/inventory.ts';
import { application } from '#lib/server/composition.ts';
export const addToInventory = (actor: AuthUser, input: InventoryAdd) =>
	application.inventory.add(actor, input);
export const updateInventoryCard = (actor: AuthUser, input: InventoryPatch) =>
	application.inventory.patchEntry(actor, input);
export const removeInventoryCard = (actor: AuthUser, input: InventoryRemove) =>
	application.inventory.remove(actor, input);
