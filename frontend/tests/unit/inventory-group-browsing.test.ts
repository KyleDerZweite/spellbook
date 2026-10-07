import { render } from 'svelte/server';
import { expect, it } from 'vitest';
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
it('renders the full selected numeric page and retains browser/filter identity in group links', async () => {
	const { body } = await render(GroupDirectory, {
		props: {
			groups: groups.slice(500, 1000),
			canonicalURL: new URL('http://local/mtg/inventory?pageSize=500&page=2&set=dom'),
			dialogOpen: false,
			onRename() {},
			onRemove() {}
		}
	});
	expect((body.match(/data-group-index=/g) ?? []).length).toBe(500);
	expect(body).toContain('pageSize=500');
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
