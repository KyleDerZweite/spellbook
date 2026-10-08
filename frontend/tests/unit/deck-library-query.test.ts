import { describe, it, expect } from 'vitest';
import {
	normalizeDeckLibraryQuery,
	deckLibraryQueryKey,
	deckLibraryQueryFromParams
} from '../../../contracts/src/deck-library.ts';
import { parseDeckLibraryInput } from '../../../backend/src/decks/query.ts';

const version = '11111111-AAAA-4111-8111-111111111111';
describe('Deck Library query contract', () => {
	it('normalizes equivalent version selections into one identity without changing Catalog q', () => {
		const params = new URLSearchParams({
			q: 'Lightning Bolt',
			dirQ: '  My Deck  ',
			dirFormat: ' Commander ',
			dirSort: 'name:asc'
		});
		params.append('dirCategory', version);
		params.append('dirCategory', version.toLowerCase());
		const query = deckLibraryQueryFromParams(params);
		expect(query).toEqual({
			query: 'My Deck',
			format: 'Commander',
			categoryVersionIds: [version.toLowerCase()],
			sort: 'name:asc'
		});
		expect(params.get('q')).toBe('Lightning Bolt');
		expect(deckLibraryQueryKey(query)).toBe(
			deckLibraryQueryKey({ ...query, categoryVersionIds: [version, version.toLowerCase()] })
		);
	});
	it('normalizes unicode names and rejects malformed identities and filter types', () => {
		expect(normalizeDeckLibraryQuery({ query: 'Cafe\u0301' }).query).toBe('Café');
		for (const value of [
			{ categoryVersionIds: ['Draw'] },
			{ categoryVersionIds: Array(101).fill(version) },
			{ query: '\0' },
			{ format: 1 },
			{ sort: 'priority' }
		])
			expect(() => normalizeDeckLibraryQuery(value)).toThrow();
	});
	it('enforces bounded rows, safe offsets and canonical decimal revisions', () => {
		expect(
			parseDeckLibraryInput({ limit: 200, offset: 1_000_000, expectedRevision: '0' })
		).toMatchObject({ limit: 200, offset: 1_000_000, expectedRevision: '0' });
		for (const value of [
			{ limit: 201 },
			{ limit: 0 },
			{ offset: -1 },
			{ offset: NaN },
			{ expectedRevision: '01' },
			{ expectedRevision: 0 },
			{ unknown: true }
		])
			expect(() => parseDeckLibraryInput(value)).toThrow();
	});
});
