import { error } from '@sveltejs/kit';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { application } from '#lib/server/composition.ts';
export async function changePassword(
	actor: AuthUser,
	currentPassword: string,
	newPassword: string
) {
	try {
		return await application.auth.changePassword(actor, currentPassword, newPassword);
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'kind' in cause) {
			if (cause.kind === 'RateLimited')
				error(429, cause instanceof Error ? cause.message : 'Authentication is busy.');
			if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
		}
		throw cause;
	}
}
