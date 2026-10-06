import { application } from '#lib/server/composition.ts';
export {
	inventoryQueryFromUrl,
	normalizeInventoryQuery
} from '@spellbook/backend/inventory/query.ts';
export const inventoryApplication = application.inventory;
