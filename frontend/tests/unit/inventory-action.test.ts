import { describe, expect, it } from 'vitest';
import {
	inventoryAction,
	effectiveInventoryUrl,
	submittedDraftMatches
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
