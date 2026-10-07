import { error } from '@sveltejs/kit';
export function priceReadError(cause: unknown): never {
	if (cause && typeof cause === 'object' && 'kind' in cause) {
		if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
		if (cause.kind === 'InventoryPriceNotFound') error(404, 'Inventory entry not found.');
		if (cause.kind === 'PriceReadUnavailable')
			error(503, 'Reference prices are temporarily unavailable.');
		if (cause.kind === 'ValidationFailed')
			error(400, cause instanceof Error ? cause.message : 'Invalid price request');
	}
	// Existing validation errors use the shared named Error class.
	if (cause instanceof Error && cause.name === 'ValidationError') error(400, cause.message);
	if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
	error(503, 'Reference prices are temporarily unavailable.');
}
