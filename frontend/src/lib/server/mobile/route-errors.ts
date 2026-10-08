import {
	LibraryConflict,
	CategoryPreviewExpired,
	CategoryPreviewCapacity,
	CategoryUnavailable,
	CategoryNotFound,
	CategoryConflict,
	CategoryMergeConflict
} from '#lib/server/composition.ts';
import { DescriptionConflictError, DeckNotFoundError } from '#lib/server/data/decks.ts';
import {
	InventoryNotFoundError,
	InventoryQuantityChangedError,
	NotesConflictError
} from '#lib/server/data/inventory.ts';
import { error } from '@sveltejs/kit';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';

/** Map domain failures to HTTP status codes and preserve infrastructure failures. */
export function badRequestIfValidation(cause: unknown, fallback = 'Invalid request'): never {
	if (cause instanceof LibraryConflict || cause instanceof CategoryPreviewExpired)
		throw error(409, { kind: cause.kind, message: cause.message });
	if (cause instanceof CategoryPreviewCapacity || cause instanceof CategoryUnavailable)
		throw error(503, { kind: cause.kind, message: cause.message });
	if (
		cause &&
		typeof cause === 'object' &&
		'kind' in cause &&
		cause.kind === 'InvalidInventoryCount'
	)
		throw error(500, 'Inventory totals cannot be represented exactly.');
	if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
		throw error(401, 'Authentication required');
	if (cause instanceof CategoryNotFound)
		throw error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof CategoryConflict)
		throw error(409, { kind: cause.kind, message: cause.message, latest: cause.latest });
	if (cause instanceof CategoryMergeConflict)
		throw error(409, { kind: cause.kind, message: cause.message, preview: cause.preview });
	if (cause instanceof NotesConflictError)
		throw error(409, { kind: 'NotesConflict', message: cause.message, ...cause.latest });
	if (cause instanceof InventoryQuantityChangedError)
		throw error(409, {
			kind: 'QuantityChanged',
			message: cause.message,
			latestQuantity: cause.latestQuantity
		});
	if (cause instanceof InventoryNotFoundError)
		throw error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof DescriptionConflictError)
		throw error(409, { kind: 'DescriptionConflict', message: cause.message, ...cause.latest });
	if (cause instanceof DeckNotFoundError)
		throw error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof RequestConflictError) {
		throw error(409, { kind: 'RequestConflict', message: cause.message });
	}
	if (cause instanceof ValidationError) {
		throw error(400, cause.message);
	}
	if (cause && typeof cause === 'object' && 'status' in cause) {
		throw cause;
	}
	throw cause instanceof Error ? cause : new Error(fallback);
}
