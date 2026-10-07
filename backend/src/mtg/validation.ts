import type { ApplicationFailure } from '@spellbook/contracts/errors.ts';

export class ValidationError
	extends Error
	implements Extract<ApplicationFailure, { kind: 'ValidationFailed' }>
{
	readonly kind = 'ValidationFailed';
	constructor(message: string) {
		super(message);
		this.name = 'ValidationError';
	}
}

export const VALID_CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export const VALID_FINISHES = ['nonfoil', 'foil'] as const;
export const INVENTORY_OPERATION_TYPES = ['add', 'set', 'decrement', 'remove'] as const;
export const DECK_OPERATION_TYPES = ['add', 'set', 'decrement', 'remove', 'move'] as const;
export const DECK_ROLES = ['main', 'sideboard', 'commander', 'companion'] as const;
export const INVENTORY_SOURCES = ['mobile', 'web', 'import', 'scan', 'scan_review'] as const;
export const DECK_SOURCES = ['mobile', 'web', 'import'] as const;

export type InventoryOperationType = (typeof INVENTORY_OPERATION_TYPES)[number];
export type DeckOperationType = (typeof DECK_OPERATION_TYPES)[number];
export type DeckRole = (typeof DECK_ROLES)[number];
export type CardCondition = (typeof VALID_CONDITIONS)[number];
export type CardFinish = (typeof VALID_FINISHES)[number];
export type InventorySource = (typeof INVENTORY_SOURCES)[number];
export type DeckSource = (typeof DECK_SOURCES)[number];

export interface CardIdentityInput {
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
}

/**
 * Input shape — what callers may pass into bulk mutation entry points.
 * Fields that the validator normalizes (notes default, role default,
 * trimmed strings) are optional here.
 */
export type InventoryBulkOperationInput =
	| {
			op: 'add';
			card: CardIdentityInput;
			finish: CardFinish | string;
			condition: CardCondition | string;
			quantity: number;
			notes?: string;
	  }
	| {
			op: 'set' | 'decrement';
			target: { entryId: string };
			quantity: number;
			notes?: string;
	  }
	| {
			op: 'remove';
			target: { entryId: string };
			notes?: string;
	  };

/**
 * Normalized output of {@link assertInventoryOperation}. Add operations default
 * notes to an empty string; target operations preserve omitted notes so callers
 * can distinguish "leave notes unchanged" from "clear notes".
 */
export type InventoryBulkOperation =
	| {
			op: 'add';
			card: CardIdentityInput;
			finish: CardFinish;
			condition: CardCondition;
			quantity: number;
			notes: string;
	  }
	| {
			op: 'set';
			target: { entryId: string };
			quantity: number;
			notes?: string;
	  }
	| {
			op: 'decrement';
			target: { entryId: string };
			quantity: number;
			notes?: string;
	  }
	| {
			op: 'remove';
			target: { entryId: string };
			notes?: string;
	  };

export type DeckBulkOperationInput =
	| {
			op: 'add';
			card: CardIdentityInput;
			quantity: number;
			role?: DeckRole | string;
	  }
	| {
			op: 'set' | 'decrement';
			target: { entryId: string };
			quantity: number;
	  }
	| {
			op: 'move';
			target: { entryId: string };
			role: DeckRole;
	  }
	| {
			op: 'remove';
			target: { entryId: string };
	  };

export type DeckBulkOperation =
	| {
			op: 'add';
			card: CardIdentityInput;
			quantity: number;
			role: DeckRole;
	  }
	| {
			op: 'set';
			target: { entryId: string };
			quantity: number;
	  }
	| {
			op: 'decrement';
			target: { entryId: string };
			quantity: number;
	  }
	| {
			op: 'move';
			target: { entryId: string };
			role: DeckRole;
	  }
	| {
			op: 'remove';
			target: { entryId: string };
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string, fallback = ''): string {
	if (value === undefined) return fallback;
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
	return value;
}

export function assertRequestId(value: unknown): string {
	const requestId = assertString(value, 'requestId').trim();
	if (!requestId) {
		throw new ValidationError('requestId is required');
	}
	return requestId;
}

export function normalizeSource<T extends readonly string[]>(
	value: unknown,
	allowed: T,
	fallback: T[number]
): T[number] {
	const source = assertString(value, 'source', fallback).trim();
	if (!allowed.includes(source as T[number])) {
		throw new ValidationError(`Invalid source: ${source}`);
	}
	return source as T[number];
}

export function assertInventoryOperation(value: unknown): InventoryBulkOperation {
	if (!isRecord(value)) {
		throw new ValidationError('Invalid operation: expected object');
	}
	const op = assertString(value.op, 'op');
	if (!INVENTORY_OPERATION_TYPES.includes(op as InventoryOperationType)) {
		throw new ValidationError(`Invalid operation: ${op}`);
	}

	if (op === 'add') {
		return {
			op: 'add',
			card: assertCardIdentity(value.card),
			finish: assertFinish(value.finish),
			condition: assertCondition(value.condition),
			quantity: assertPositiveQuantity(value.quantity),
			notes: assertString(value.notes, 'notes')
		};
	}

	const target = { entryId: assertEntryTarget(value.target) };
	const notes = Object.hasOwn(value, 'notes') ? assertString(value.notes, 'notes') : undefined;

	if (op === 'remove') {
		return { op: 'remove', target, ...(notes === undefined ? {} : { notes }) };
	}

	return {
		op: op as 'set' | 'decrement',
		target,
		quantity:
			op === 'decrement'
				? assertPositiveQuantity(value.quantity)
				: assertFiniteQuantity(value.quantity),
		...(notes === undefined ? {} : { notes })
	};
}

export function assertDeckOperation(value: unknown): DeckBulkOperation {
	if (!isRecord(value)) {
		throw new ValidationError('Invalid operation: expected object');
	}
	const op = assertString(value.op, 'op');
	if (!DECK_OPERATION_TYPES.includes(op as DeckOperationType)) {
		throw new ValidationError(`Invalid operation: ${op}`);
	}

	if (op === 'add') {
		return {
			op: 'add',
			card: assertCardIdentity(value.card),
			quantity: assertPositiveQuantity(value.quantity),
			role: assertDeckRole(value.role ?? 'main')
		};
	}

	const target = { entryId: assertEntryTarget(value.target) };

	if (op === 'remove') {
		return { op: 'remove', target };
	}
	if (op === 'move') {
		return { op: 'move', target, role: assertDeckRole(value.role) };
	}

	return {
		op: op as 'set' | 'decrement',
		target,
		quantity:
			op === 'decrement'
				? assertPositiveQuantity(value.quantity)
				: assertFiniteQuantity(value.quantity)
	};
}

export function assertFinish(value: unknown): CardFinish {
	const finish = assertString(value, 'value').trim();
	if (!VALID_FINISHES.includes(finish as CardFinish)) {
		throw new ValidationError(`Invalid finish: ${finish}`);
	}
	return finish as CardFinish;
}

export function assertCondition(value: unknown): CardCondition {
	const condition = assertString(value, 'value').trim();
	if (!VALID_CONDITIONS.includes(condition as CardCondition)) {
		throw new ValidationError(`Invalid condition: ${condition}`);
	}
	return condition as CardCondition;
}

export function assertDeckRole(value: unknown): DeckRole {
	const role = assertString(value, 'value').trim();
	if (!DECK_ROLES.includes(role as DeckRole)) {
		throw new ValidationError(`Invalid role: ${role}`);
	}
	return role as DeckRole;
}

export function normalizeQuantity(value: unknown): number {
	const quantity = value;
	if (
		typeof quantity !== 'number' ||
		!Number.isSafeInteger(quantity) ||
		Math.abs(quantity) > 2147483647
	) {
		throw new ValidationError('Quantity must be a finite 32-bit integer');
	}
	return quantity;
}

function assertPositiveQuantity(value: unknown): number {
	const quantity = normalizeQuantity(value);
	if (quantity <= 0) {
		throw new ValidationError('Quantity must be greater than 0');
	}
	return quantity;
}

function assertFiniteQuantity(value: unknown): number {
	return normalizeQuantity(value);
}

function assertEntryTarget(target: unknown): string {
	const entryId = assertString(
		(target as { entryId?: unknown } | undefined)?.entryId,
		'target.entryId'
	).trim();
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entryId)) {
		throw new ValidationError('target.entryId must be a UUID');
	}
	return entryId;
}

function assertCardIdentity(card: unknown): CardIdentityInput {
	if (!isRecord(card)) {
		throw new ValidationError(
			'card.catalogCardId, card.canonicalCardId, and card.name are required'
		);
	}
	const catalogCardId = assertString(card.catalogCardId, 'card.catalogCardId').trim();
	const canonicalCardId = assertString(card.canonicalCardId, 'card.canonicalCardId').trim();
	const name = assertString(card.name, 'card.name').trim();
	if (!catalogCardId || !canonicalCardId || !name) {
		throw new ValidationError(
			'card.catalogCardId, card.canonicalCardId, and card.name are required'
		);
	}
	return {
		catalogCardId,
		canonicalCardId,
		name,
		setCode: assertString(card.setCode, 'card.setCode').trim(),
		imageUri: assertString(card.imageUri, 'card.imageUri').trim()
	};
}

export function assertBoundedText(value: unknown, field: string, limit: number): string {
	if (typeof value !== 'string' || value.length > limit)
		throw new ValidationError(`${field} must be a string of at most ${limit} characters`);
	return value;
}
export function assertUuid(value: unknown, field: string): string {
	const result = assertBoundedText(value, field, 36).toLowerCase();
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(result))
		throw new ValidationError(`${field} must be a UUID`);
	return result;
}
export function positiveQuantity(value: unknown): number {
	const result = normalizeQuantity(value);
	if (result <= 0) throw new ValidationError('Quantity must be greater than zero');
	return result;
}
