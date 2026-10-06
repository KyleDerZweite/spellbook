import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { application } from '#lib/server/composition.ts';
export const getProfileCard = async (actor: AuthUser) =>
	(await application.profile.get(actor)).card;
export const getProfileTotals = async (actor: AuthUser) =>
	(await application.profile.get(actor)).totals;
