import type { AuthUser } from '#lib/auth/types.ts';
import { application } from '#lib/server/composition.ts';
export const getProfileSettings = (user: AuthUser) => application.profile.get(user);
