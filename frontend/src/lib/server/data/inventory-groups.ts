import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { application } from '#lib/server/composition.ts';
export const createInventoryGroup = (actor: AuthUser, input: { requestId: string; name: string }) =>
	application.inventory.createGroup(actor, input);
export const renameInventoryGroup = (
	actor: AuthUser,
	input: { requestId: string; groupId: string; name: string }
) => application.inventory.renameGroup(actor, input);
export const deleteInventoryGroup = (
	actor: AuthUser,
	input: { requestId: string; groupId: string }
) => application.inventory.deleteGroup(actor, input);
export const replaceInventoryGroupMemberships = (
	actor: AuthUser,
	input: { requestId: string; entryId: string; groupIds: string[] }
) => application.inventory.replaceMemberships(actor, input);
