import { describe, expect, it } from 'vitest';
import { inventoryMetadataHref } from '#lib/inventory/filter-shortcuts.ts';

const current = () =>
	new URL(
		'https://spellbook.test/mtg/inventory?q=Elves&set=DOM&set=lea&finish=foil&condition=LP&sort=set&dir=desc&variant=quantity&variantDir=desc&view=cards&group=box-id&page=5&pageSize=lazy'
	);
const target = (url: URL, kind: 'set' | 'finish' | 'condition', value: string) =>
	new URL(inventoryMetadataHref(url, kind, value), url);

describe('Inventory metadata filter shortcuts', () => {
	it('adds normalized sets to the existing OR selection idempotently', () => {
		const original = current();
		const added = target(original, 'set', ' MH3 ');
		expect(added.searchParams.getAll('set')).toEqual(['dom', 'lea', 'mh3']);
		expect(target(added, 'set', 'DOM').searchParams.getAll('set')).toEqual(['dom', 'lea', 'mh3']);
		expect(original.searchParams.getAll('set')).toEqual(['DOM', 'lea']);
	});

	it.each([
		['finish', 'nonfoil', 'condition', 'LP'],
		['condition', 'NM', 'finish', 'foil']
	] as const)(
		'replaces %s while retaining the other variant filter',
		(kind, value, other, expected) => {
			const next = target(current(), kind, value);
			expect(next.searchParams.getAll(kind)).toEqual([value]);
			expect(next.searchParams.get(other)).toBe(expected);
			expect(next.searchParams.getAll('set')).toEqual(['DOM', 'lea']);
		}
	);

	it('starts the first continuous range while preserving supported query and Box fields', () => {
		const original = current();
		original.searchParams.set('offset', '800');
		original.searchParams.set('limit', '200');
		original.searchParams.set('/updateQuantity', '');
		const next = target(original, 'condition', 'HP');
		for (const field of ['q', 'sort', 'dir', 'variant', 'variantDir', 'view', 'group']) {
			expect(next.searchParams.get(field)).toBe(original.searchParams.get(field));
		}
		expect(next.pathname).toBe('/mtg/inventory');
		expect(next.searchParams.get('page')).toBe('1');
		expect(next.searchParams.get('pageSize')).toBe('lazy');
		expect(next.searchParams.has('offset')).toBe(false);
		expect(next.searchParams.has('limit')).toBe(false);
		expect(next.searchParams.has('/updateQuantity')).toBe(false);
		expect(original.searchParams.get('page')).toBe('5');
	});
});
