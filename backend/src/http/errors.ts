import {
	CategoryConflict,
	CategoryMergeConflict,
	CategoryNotFound,
	CategoryPreviewCapacity,
	CategoryPreviewExpired,
	CategoryUnavailable,
	DeckNotFoundError,
	DescriptionConflictError,
	InventoryNotFoundError,
	InventoryQuantityChangedError,
	LibraryConflict,
	NotesConflictError,
	RequestConflictError,
	ValidationError
} from '../transport.ts';

export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly body: { message: string; [key: string]: unknown }
	) {
		super(body.message);
	}
}

export function error(
	status: number,
	body: string | { message: string; [key: string]: unknown }
): never {
	if (!Number.isInteger(status) || status < 400 || status > 599)
		throw new Error('Invalid HTTP error status');
	throw new HttpError(status, typeof body === 'string' ? { message: body } : body);
}

export function json(value: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	return new Response(JSON.stringify(value), { ...init, headers });
}

/** Serialize only reviewed public domain failures. Infrastructure errors remain private. */
export function badRequestIfValidation(cause: unknown, fallback = 'Invalid request'): never {
	if (cause instanceof HttpError) throw cause;
	if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'RevisionChanged')
		error(409, {
			kind: 'RevisionChanged',
			message: 'Deck Library changed. Read the latest directory and retry.'
		});
	if (cause instanceof LibraryConflict || cause instanceof CategoryPreviewExpired)
		error(409, { kind: cause.kind, message: cause.message });
	if (cause instanceof CategoryPreviewCapacity || cause instanceof CategoryUnavailable)
		error(503, { kind: cause.kind, message: cause.message });
	if (cause && typeof cause === 'object' && 'kind' in cause) {
		if (cause.kind === 'InvalidInventoryCount')
			error(500, 'Inventory totals cannot be represented exactly.');
		if (cause.kind === 'Unauthenticated') error(401, 'Authentication required');
	}
	if (cause instanceof CategoryNotFound) error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof CategoryConflict)
		error(409, { kind: cause.kind, message: cause.message, latest: cause.latest });
	if (cause instanceof CategoryMergeConflict)
		error(409, { kind: cause.kind, message: cause.message, preview: cause.preview });
	if (cause instanceof NotesConflictError)
		error(409, { kind: 'NotesConflict', message: cause.message, ...cause.latest });
	if (cause instanceof InventoryQuantityChangedError)
		error(409, {
			kind: 'QuantityChanged',
			message: cause.message,
			latestQuantity: cause.latestQuantity
		});
	if (cause instanceof InventoryNotFoundError)
		error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof DescriptionConflictError)
		error(409, { kind: 'DescriptionConflict', message: cause.message, ...cause.latest });
	if (cause instanceof DeckNotFoundError) error(404, { kind: 'NotFound', message: cause.message });
	if (cause instanceof RequestConflictError)
		error(409, { kind: 'RequestConflict', message: cause.message });
	if (cause instanceof ValidationError) error(400, cause.message);
	throw cause instanceof Error ? cause : new Error(fallback);
}

export function errorResponse(cause: unknown): Response {
	try {
		badRequestIfValidation(cause);
	} catch (failure) {
		if (failure instanceof HttpError) return json(failure.body, { status: failure.status });
		return json({ message: 'Internal Server Error' }, { status: 500 });
	}
}
