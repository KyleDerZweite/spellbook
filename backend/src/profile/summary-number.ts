import { databaseInteger, DatabaseIntegerRangeError } from '../db/numbers.ts';
import {
	SUMMARY_RANGE_MESSAGE,
	type ProfileTotals,
	type SummaryFailure
} from '@spellbook/contracts/profile.ts';

export class SummaryRangeError extends Error implements SummaryFailure {
	readonly kind = 'SummaryOutOfRange';
	constructor() {
		super(SUMMARY_RANGE_MESSAGE);
	}
}

/** Decode exact PostgreSQL counts before creating JSON DTOs. Never round stored quantities. */
export function summaryNumber(value: unknown): number {
	try {
		const number = databaseInteger(value);
		if (number < 0) throw new SummaryRangeError();
		return number;
	} catch (cause) {
		if (cause instanceof DatabaseIntegerRangeError) throw new SummaryRangeError();
		throw cause;
	}
}

export function profileTotals(value: { [Key in keyof ProfileTotals]: unknown }): ProfileTotals {
	return {
		total: summaryNumber(value.total),
		names: summaryNumber(value.names),
		printings: summaryNumber(value.printings),
		sets: summaryNumber(value.sets),
		foils: summaryNumber(value.foils),
		decks: summaryNumber(value.decks)
	};
}
