import { application } from '#lib/server/composition.ts';
export { inventoryQueryFromUrl, normalizeInventoryQuery } from '@spellbook/backend/transport.ts';
export const inventoryApplication = application.inventory;
