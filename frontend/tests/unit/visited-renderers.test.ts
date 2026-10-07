import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import VirtualCardGrid from '../../src/lib/components/cards/VirtualCardGrid.svelte';
import VirtualInventoryList from '../../src/lib/components/inventory/VirtualInventoryList.svelte';
import GroupDirectory from '../../src/lib/components/inventory/GroupDirectory.svelte';

it('renders the same initial Search extent for 500 and 50,000 matches at a deep anchor', () => {
	const output = (totalCount: number) =>
		render(VirtualCardGrid, {
			props: { totalCount, anchorIndex: 200, span: { start: 200, end: 400 } }
		}).body;
	const first = output(500),
		large = output(50000);
	expect(first.match(/height: ([\d.]+)px/)?.[1]).toBe(large.match(/height: ([\d.]+)px/)?.[1]);
	expect(large).toContain('data-browse-span-start="200"');
	expect(large).toContain('data-browse-span-end="400"');
});

it('reserves only the visited Inventory segment without an unfetched deep prefix', () => {
	const output = render(VirtualInventoryList, {
		props: {
			total: 50000,
			span: { start: 8000, end: 8200 },
			getEntry: () => undefined,
			loadedIndexes: [],
			version: 0,
			queryKey: 'fixture',
			initialIndex: 8000,
			row: createRawSnippet(() => ({ render: () => '<div></div>' })),
			onRange: () => {}
		}
	}).body;
	expect(output).toContain('height: 19200px');
	expect(output).toContain('data-inventory-index="8000"');
	expect(output).toContain('top: 0px');
});

it('starts the Boxes directory at its selected 200-row segment', () => {
	const groups = Array.from({ length: 1000 }, (_, i) => ({
		id: String(i),
		name: `Box ${i}`,
		entryCount: 0,
		quantity: 0
	}));
	const output = render(GroupDirectory, {
		props: {
			groups,
			lazy: true,
			initialIndex: 400,
			dialogOpen: false,
			onRename: () => {},
			onRemove: () => {}
		}
	}).body;
	expect(output).toContain('height: 22400px');
	expect(output).toContain('data-browse-span-start="400"');
	expect(output).toContain('data-browse-span-end="600"');
});
