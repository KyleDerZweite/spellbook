import {
	normalizeDeckLibraryQuery,
	DECK_LIBRARY_PAGE_LIMIT
} from '@spellbook/contracts/deck-library.ts';
import type { DeckLibraryInput } from '@spellbook/contracts/deck-library.ts';
import { ValidationError } from '../mtg/validation.ts';

export function parseDeckLibraryInput(input: unknown = {}, extraFields: string[] = []) {
	if (
		!input ||
		typeof input !== 'object' ||
		Array.isArray(input) ||
		Object.keys(input).some(
			(key) =>
				![
					'query',
					'format',
					'categoryVersionIds',
					'sort',
					'offset',
					'limit',
					'expectedRevision',
					...extraFields
				].includes(key)
		)
	)
		throw new ValidationError('Invalid Deck Library options');
	const value = input as DeckLibraryInput;
	let query;
	try {
		query = normalizeDeckLibraryQuery(value);
	} catch (error) {
		throw new ValidationError(
			error instanceof Error ? error.message : 'Invalid Deck Library query'
		);
	}
	const offset = value.offset ?? 0,
		limit = value.limit ?? 40;
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
		throw new ValidationError('Invalid Deck Library offset');
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > DECK_LIBRARY_PAGE_LIMIT)
		throw new ValidationError('Invalid Deck Library limit');
	if (
		value.expectedRevision !== undefined &&
		(typeof value.expectedRevision !== 'string' ||
			!/^(0|[1-9]\d*)$/.test(value.expectedRevision) ||
			value.expectedRevision.length > 19)
	)
		throw new ValidationError('Invalid Deck Library revision');
	return { query, offset, limit, expectedRevision: value.expectedRevision };
}
