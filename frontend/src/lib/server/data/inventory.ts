export {
	InventoryQuantityChangedError,
	InventoryNotFoundError,
	NotesConflictError
} from '@spellbook/backend/transport.ts';
import type { InventoryBatchItem } from './types';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type {
	InventoryAdd,
	InventoryBulkInput,
	InventoryPatch,
	InventoryRemove
} from '@spellbook/contracts/inventory.ts';
import { application } from '#lib/server/composition.ts';
export const addToInventory = (actor: AuthUser, input: InventoryAdd) =>
	application.inventory.add(actor, input);
export const bulkMutateInventory = (actor: AuthUser, input: InventoryBulkInput) =>
	application.inventory.bulk(actor, input);
export const updateInventoryCard = (actor: AuthUser, input: InventoryPatch) =>
	application.inventory.patchEntry(actor, input);
export const removeInventoryCard = (actor: AuthUser, input: InventoryRemove) =>
	application.inventory.remove(actor, input);
export const reorderInventoryCard = (
	actor: AuthUser,
	input: { requestId: string; entryId: string; position: number }
) => application.inventory.reorder(actor, input);
export const batchAddInventory = (
	actor: AuthUser,
	requestId: string,
	source: import('@spellbook/contracts/inventory.ts').InventorySource,
	items: InventoryBatchItem[]
) =>
	application.inventory.bulk(actor, {
		requestId,
		source,
		operations: items.map((item) => ({ op: 'add', ...item }))
	});
