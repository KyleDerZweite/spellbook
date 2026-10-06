import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { application } from '#lib/server/composition.ts';
export const getDashboard = (actor: AuthUser) => application.dashboard.get(actor);
