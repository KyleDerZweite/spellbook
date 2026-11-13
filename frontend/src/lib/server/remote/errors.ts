import { ValidationError } from '@spellbook/contracts/validation.ts';
import { SUMMARY_RANGE_MESSAGE } from '@spellbook/contracts/profile.ts';

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
export class DeckNotFoundError extends ValidationError {
	constructor(message = 'Deck or entry not found') {
		super(message);
	}
}
export class InventoryNotFoundError extends ValidationError {}
export class InventoryGroupNotFoundError extends InventoryNotFoundError {
	constructor(message = 'Inventory group not found') {
		super(message);
	}
}
export class InventoryGroupNameError extends ValidationError {
	constructor(message = 'Group name must contain 1 to 64 characters') {
		super(message);
	}
}
export class InventoryGroupConflictError extends ValidationError {
	constructor(message = 'A group with this name already exists') {
		super(message);
	}
}
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
export class QrAuthError extends RemoteError {
	declare readonly kind:
		'ValidationFailed' | 'NotFound' | 'Conflict' | 'Unauthenticated' | 'RateLimited';
}

export type ErrorDomain = 'inventory' | 'decks' | 'qr';
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
		if (kind === 'RequestConflict') return new RequestConflictError(message);
	}
	if (status === 404) {
		if (kind === 'GroupNotFound') return new InventoryGroupNotFoundError(message);
		if (domain === 'decks') return new DeckNotFoundError(message);
		if (domain === 'inventory') return new InventoryNotFoundError(message);
	}
	if (status === 400) {
		if (kind === 'GroupNameInvalid' || kind === 'GroupDuplicate') {
			const failure =
				kind === 'GroupNameInvalid'
					? new InventoryGroupNameError(message)
					: new InventoryGroupConflictError(message);
			if (record(body.fields)) Object.assign(failure, { fields: body.fields });
			return failure;
		}
		if (!kind || kind === 'ValidationFailed') {
			const failure = new ValidationError(message);
			if (record(body.fields)) Object.assign(failure, { fields: body.fields });
			return failure;
		}
	}
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
	if (
		status === 500 &&
		(kind === 'InvalidInventoryCount' ||
			message === 'Inventory totals cannot be represented exactly.')
	)
		return new RemoteError(status, 'InvalidInventoryCount', message);
	if (status >= 500) return new RemoteUnavailableError();
	const failure = new RemoteError(status, kind, message);
	if (record(body.fields)) Object.assign(failure, { fields: body.fields });
	return failure;
}
