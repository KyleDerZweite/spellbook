import { describe, expect, it } from 'vitest';
import {
	inventoryAction,
	effectiveInventoryUrl,
	submittedDraftMatches,
	confirmedInventoryBases
} from '#lib/mtg/inventory-action.ts';

describe('inventory action location', () => {
	it('retains a selected group through a mutation without changing the original URL', () => {
		const current = new URL('https://spellbook.test/mtg/inventory?view=groups&group=example');
		const target = new URL(inventoryAction('assignGroups', current), current);
		expect(target.searchParams.get('view')).toBe('groups');
		expect(target.searchParams.get('group')).toBe('example');
		expect(target.searchParams.has('/assignGroups')).toBe(true);
		expect(current.searchParams.has('/assignGroups')).toBe(false);
	});

	it('replaces a previous named action while preserving repeated view parameters', () => {
		const current = new URL('https://spellbook.test/mtg/inventory?tag=a&tag=b&/createGroup');
		const target = new URL(inventoryAction('renameGroup', current), current);
		expect(target.searchParams.getAll('tag')).toEqual(['a', 'b']);
		expect(target.searchParams.has('/createGroup')).toBe(false);
		expect(target.searchParams.has('/renameGroup')).toBe(true);
	});
});

it('posts the cleared shallow query instead of the original empty-result query', () => {
	const url = new URL('https://spellbook.test/mtg/inventory?q=missing&page=5');
	const shallow = { url: new URL('https://spellbook.test/mtg/inventory?q=&page=5') };
	const target = new URL(
		inventoryAction('updateQuantity', effectiveInventoryUrl({ url, shallow })),
		url
	);
	expect(target.searchParams.get('q')).toBe('');
	expect(target.searchParams.get('page')).toBe('5');
	expect(url.searchParams.get('q')).toBe('missing');
});
it('uses the canonical Inventory background while Search owns the shallow URL', () => {
	const url = new URL('https://spellbook.test/mtg/inventory?q=missing');
	expect(
		effectiveInventoryUrl({
			url,
			shallow: { url: new URL('https://spellbook.test/mtg/search?q=bolt') },
			state: {
				searchOverlay: { background: 'https://spellbook.test/mtg/inventory?q=&set=a&set=b' }
			}
		}).search
	).toBe('?q=&set=a&set=b');
	expect(
		effectiveInventoryUrl({
			url,
			state: { searchOverlay: { background: 'https://outside.test/mtg/inventory' } }
		})
	).toBe(url);
});
it('does not mark a newer or different inspector draft as saved', () => {
	const submitted = { id: 'a', notes: 'submitted', quantity: 2 };
	expect(submittedDraftMatches(submitted, submitted)).toBe(true);
	expect(submittedDraftMatches(submitted, { ...submitted, notes: 'new typing' })).toBe(false);
	expect(submittedDraftMatches(submitted, { ...submitted, quantity: 3 })).toBe(false);
	expect(submittedDraftMatches(submitted, { ...submitted, id: 'b' })).toBe(false);
});

it('advances confirmed Notes bases without replacing a newer draft', () => {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		entryId: 'a',
		notes: 'A',
		notesOriginal: '',
		notesRevision: '0',
		quantity: '1',
		quantityBase: '1'
	}))
		form.set(key, value);
	const result = confirmedInventoryBases(
		form,
		{ changes: [{ entryId: 'a', quantity: 1, notesRevision: '1' }] },
		{ notesOriginal: '', notesBase: '0', quantityBase: 1 }
	);
	expect(result).toEqual({ notesOriginal: 'A', notesBase: '1', quantityBase: 1 });
});
it('advances only a submitted Quantity base so a later Notes save preserves a remote increment', () => {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		entryId: 'a',
		notes: 'A',
		notesOriginal: 'A',
		notesRevision: '1',
		quantity: '2',
		quantityBase: '1'
	}))
		form.set(key, value);
	const result = confirmedInventoryBases(
		form,
		{ changes: [{ entryId: 'a', quantity: 2, notesRevision: '7' }] },
		{ notesOriginal: 'A', notesBase: '1', quantityBase: 1 }
	);
	expect(result).toEqual({ notesOriginal: 'A', notesBase: '1', quantityBase: 2 });
});
