import { describe, expect, it } from 'vitest';
import { inventoryAction } from '#lib/mtg/inventory-action.ts';

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
