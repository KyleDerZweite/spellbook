import { error } from '@sveltejs/kit';
import { ValidationError } from '$lib/server/mtg/validation';

/**
 * Convert a thrown ValidationError into a 400 response, but let every other
 * error bubble so infrastructure failures surface as 500s.
 */
export function badRequestIfValidation(cause: unknown, fallback = 'Invalid request'): never {
	if (cause instanceof ValidationError) {
		throw error(400, cause.message);
	}
	if (cause && typeof cause === 'object' && 'status' in cause) {
		throw cause;
	}
	throw cause instanceof Error ? cause : new Error(fallback);
}
