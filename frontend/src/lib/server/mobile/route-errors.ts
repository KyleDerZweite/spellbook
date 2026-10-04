import { error } from '@sveltejs/kit';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';

/**
 * Convert a thrown ValidationError into a 400 response, but let every other
 * error bubble so infrastructure failures surface as 500s.
 */
export function badRequestIfValidation(cause: unknown, fallback = 'Invalid request'): never {
	if (cause instanceof RequestConflictError) {
		throw error(409, cause.message);
	}
	if (cause instanceof ValidationError) {
		throw error(400, cause.message);
	}
	if (cause && typeof cause === 'object' && 'status' in cause) {
		throw cause;
	}
	throw cause instanceof Error ? cause : new Error(fallback);
}
