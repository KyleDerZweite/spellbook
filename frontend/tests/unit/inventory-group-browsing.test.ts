import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import { groupDirectoryIndexes } from '../../src/lib/inventory/groupRows.ts';
import GroupDirectory from '../../src/lib/components/inventory/GroupDirectory.svelte';
import type { InventoryGroup } from '../../src/lib/types/legacy.ts';
const groups: InventoryGroup[] = Array.from({ length: 10000 }, (_, index) => ({
	id: String(index),
	name: `Group ${index}`,
	entryCount: 1,
	quantity: 1,
	inventoryId: 'inventory',
	accountId: 'owner',
	createdAt: new Date(),
	updatedAt: new Date()
}));
it('renders the bounded native range and retains browser/filter identity in group links', async () => {
	const { body } = await render(GroupDirectory, {
		props: {
			groups: groups.slice(400, 600),
			canonicalURL: new URL('http://local/mtg/inventory?pageSize=lazy&page=3&set=dom'),
			dialogOpen: false,
			onRename() {},
			onRemove() {}
		}
	});
	expect((body.match(/data-group-index=/g) ?? []).length).toBe(200);
	expect(body).toContain('pageSize=lazy');
	expect(body).toContain('page=1');
	expect(body).toContain('set=dom');
	expect(body).not.toContain('overflow-y');
});
it('renders a bounded deep Lazy range from complete group metadata without earlier rows', async () => {
	const { body } = await render(GroupDirectory, {
		props: {
			groups,
			lazy: true,
			initialIndex: 9800,
			dialogOpen: false,
			onRename() {},
			onRemove() {}
		}
	});
	const rendered = (body.match(/data-group-index=/g) ?? []).length;
	expect(rendered).toBeGreaterThan(0);
	expect(rendered).toBeLessThanOrEqual(200);
	expect(body).toContain('Group 9800');
	expect(body).not.toContain('Group 0<');
});

it('does not retain the last focused index after that group is deleted', () => {
	const shortened = groups.slice(0, 9999);
	const indexes = groupDirectoryIndexes(shortened, 5, 12, true, groups[9999].id);
	expect(indexes.every((index) => shortened[index] !== undefined)).toBe(true);
});

it('retains the same focused group when metadata reorders outside the visible range', () => {
	const reordered = [...groups.slice(1), groups[0]];
	const indexes = groupDirectoryIndexes(reordered, 5, 12, true, groups[0].id);
	expect(indexes).toContain(9999);
	expect(reordered[indexes.at(-1)!].id).toBe(groups[0].id);
	expect(indexes).not.toContain(0);
});
it('bounds stale geometry after groups shrink without substituting a different focused identity', () => {
	const indexes = groupDirectoryIndexes(groups.slice(0, 3), 9995, 10000, true, groups[9999].id);
	expect(indexes).toEqual([]);
});
