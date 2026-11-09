import type { ApplicationFailure } from './errors.ts';

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
 * Normalized Inventory operation shape. Add operations default
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

function assertString(value: unknown, field: string, fallback = ''): string {
	if (value === undefined) return fallback;
	if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
	return value;
}

export function assertDeckRole(value: unknown): DeckRole {
	const role = assertString(value, 'value').trim();
	if (!DECK_ROLES.includes(role as DeckRole)) {
		throw new ValidationError(`Invalid role: ${role}`);
	}
	return role as DeckRole;
}
