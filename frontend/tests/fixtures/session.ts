import { createHash } from 'node:crypto';
export const SESSION_COOKIE = 'spellbook_session';
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
