import { ValidationError } from '@spellbook/contracts/validation.ts';
import { SUMMARY_RANGE_MESSAGE } from '@spellbook/contracts/profile.ts';
import type { DeckEntryCategories, CategoryMergePreview } from '@spellbook/contracts/categories.ts';

export class RemoteError extends Error {
	constructor(
		readonly status: number,
		readonly kind: string | undefined,
		message: string
	) {
		super(message);
	}
}
export class RemoteUnavailableError extends RemoteError {
	constructor() {
		super(503, undefined, 'The API is temporarily unavailable. Try again.');
	}
}
export class RequestConflictError extends ValidationError {
	constructor(message = 'Request ID was already used for a different mutation') {
		super(message);
		this.name = 'RequestConflictError';
	}
}
export class LibraryConflict extends RemoteError {
	declare readonly kind: 'RequestConflict';
	constructor(message = 'Request ID was already used for a different mutation') {
		super(409, 'RequestConflict', message);
	}
}
export class DeckNotFoundError extends ValidationError {
	constructor(message = 'Deck or entry not found') {
		super(message);
	}
}
export class InventoryNotFoundError extends ValidationError {}
export class NotesConflictError extends ValidationError {
	constructor(
		readonly latest: { entryId: string; notes: string; notesRevision: string },
		message = 'Notes changed. Your draft has been retained. Review the latest saved Notes before retrying.'
	) {
		super(message);
	}
}
export class InventoryQuantityChangedError extends ValidationError {
	constructor(
		readonly latestQuantity: number | null,
		message = 'This entry changed. Review its quantity before removing it.'
	) {
		super(message);
	}
}
export class DescriptionConflictError extends ValidationError {
	constructor(
		readonly latest: { description: string; descriptionRevision: string },
		message = 'Description changed. Your draft has been retained. Review the latest saved description before retrying.'
	) {
		super(message);
	}
}
export class CategoryNotFound extends RemoteError {
	declare readonly kind: 'NotFound';
	constructor(message = 'Category not found') {
		super(404, 'NotFound', message);
	}
}
export class CategoryConflict extends RemoteError {
	declare readonly kind: 'CategoryConflict';
	constructor(
		readonly latest: DeckEntryCategories,
		message = 'Categories changed. Read the latest categories and retry.'
	) {
		super(409, 'CategoryConflict', message);
	}
}
export class CategoryMergeConflict extends RemoteError {
	declare readonly kind: 'CategoryMergeConflict';
	constructor(
		readonly preview: CategoryMergePreview,
		message = 'Review the category merge before saving.'
	) {
		super(409, 'CategoryMergeConflict', message);
	}
}
export class CategoryPreviewExpired extends RemoteError {
	declare readonly kind: 'CategoryPreviewExpired';
	constructor(message = 'Category preview expired.') {
		super(409, 'CategoryPreviewExpired', message);
	}
}
export class CategoryPreviewCapacity extends RemoteError {
	declare readonly kind: 'CategoryPreviewCapacity';
	constructor(message = 'Category preview capacity is temporarily unavailable.') {
		super(503, 'CategoryPreviewCapacity', message);
	}
}
export class CategoryUnavailable extends RemoteError {
	declare readonly kind: 'CategoryUnavailable';
	constructor(message = 'Categories are temporarily unavailable.') {
		super(503, 'CategoryUnavailable', message);
	}
}
export class QrAuthError extends RemoteError {
	declare readonly kind:
		'ValidationFailed' | 'NotFound' | 'Conflict' | 'Unauthenticated' | 'RateLimited';
}

export type ErrorDomain = 'inventory' | 'decks' | 'categories' | 'qr';
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

/** Decode the flat REST failure contract without inventing absent conflict fields. */
export function decodeRemoteError(status: number, value: unknown, domain?: ErrorDomain): Error {
	const body = record(value) ? value : {};
	const kind = typeof body.kind === 'string' ? body.kind : undefined;
	const message =
		typeof body.message === 'string' ? body.message : 'The request could not be completed.';
	if (domain === 'qr' && status < 500) {
		const qrKind =
			kind ??
			(
				{
					400: 'ValidationFailed',
					401: 'Unauthenticated',
					404: 'NotFound',
					409: 'Conflict',
					429: 'RateLimited'
				} as Record<number, string>
			)[status];
		if (qrKind) return new QrAuthError(status, qrKind, message);
	}
	if (status === 401) return new RemoteError(status, 'Unauthenticated', message);
	if (status === 409) {
		if (
			kind === 'NotesConflict' &&
			typeof body.entryId === 'string' &&
			typeof body.notes === 'string' &&
			typeof body.notesRevision === 'string'
		)
			return new NotesConflictError(
				{ entryId: body.entryId, notes: body.notes, notesRevision: body.notesRevision },
				message
			);
		if (
			kind === 'QuantityChanged' &&
			(body.latestQuantity === null ||
				(typeof body.latestQuantity === 'number' && Number.isSafeInteger(body.latestQuantity)))
		)
			return new InventoryQuantityChangedError(body.latestQuantity, message);
		if (
			kind === 'DescriptionConflict' &&
			typeof body.description === 'string' &&
			typeof body.descriptionRevision === 'string'
		)
			return new DescriptionConflictError(
				{ description: body.description, descriptionRevision: body.descriptionRevision },
				message
			);
		if (kind === 'CategoryConflict' && record(body.latest))
			return new CategoryConflict(body.latest as DeckEntryCategories, message);
		if (kind === 'CategoryMergeConflict' && record(body.preview))
			return new CategoryMergeConflict(body.preview as CategoryMergePreview, message);
		if (kind === 'RequestConflict')
			return domain === 'categories'
				? new LibraryConflict(message)
				: new RequestConflictError(message);
		if (kind === 'CategoryPreviewExpired') return new CategoryPreviewExpired(message);
	}
	if (status === 404) {
		if (domain === 'decks') return new DeckNotFoundError(message);
		if (domain === 'inventory') return new InventoryNotFoundError(message);
		if (domain === 'categories') return new CategoryNotFound(message);
	}
	if (status === 400 && (!kind || kind === 'ValidationFailed')) {
		const failure = new ValidationError(message);
		if (record(body.fields)) Object.assign(failure, { fields: body.fields });
		return failure;
	}
	if (status === 503 && kind === 'CategoryPreviewCapacity')
		return new CategoryPreviewCapacity(message);
	if (status === 503 && kind === 'CategoryUnavailable') return new CategoryUnavailable(message);
	if (status === 503 && (kind === 'SummaryOutOfRange' || message === SUMMARY_RANGE_MESSAGE))
		return new RemoteError(status, 'SummaryOutOfRange', SUMMARY_RANGE_MESSAGE);
	if (
		status === 503 &&
		(kind === 'PriceReadUnavailable' || message === 'Reference prices are temporarily unavailable.')
	)
		return new RemoteError(
			status,
			'PriceReadUnavailable',
			'Reference prices are temporarily unavailable.'
		);
	if (status === 500 && message === 'Inventory totals cannot be represented exactly.')
		return new RemoteError(status, 'InvalidInventoryCount', message);
	if (status >= 500) return new RemoteUnavailableError();
	const failure = new RemoteError(status, kind, message);
	if (record(body.fields)) Object.assign(failure, { fields: body.fields });
	return failure;
}
