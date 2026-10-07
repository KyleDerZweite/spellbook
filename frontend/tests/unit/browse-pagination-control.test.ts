import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import NativeRangeNavigation from '../../src/lib/components/ui/pagination/NativeRangeNavigation.svelte';
import { parseLazyBrowsePagination } from '../../src/lib/browsing/pagination.ts';

it('renders accessible native 200-range links preserving repeated filters and original native context', async () => {
	const canonicalURL = new URL(
		'https://example.test/mtg/search?color=R&color=G&printing=invalid&deckRetryRequestId=original&page=3&offset=100&limit=50'
	);
	const { body } = await render(NativeRangeNavigation, {
		props: {
			state: parseLazyBrowsePagination(new URLSearchParams('page=3')),
			total: 1000,
			canonicalURL
		}
	});
	expect(body).toContain('Previous 200 results');
	expect(body).toContain('Next 200 results');
	expect(body).toContain('page=2');
	expect(body).toContain('page=4');
	expect(body).toContain('color=R&amp;color=G');
	expect(body).toContain('printing=invalid');
	expect(body).toContain('deckRetryRequestId=original');
	expect(body).not.toContain('offset=');
	expect(body).not.toContain('limit=');
	expect(body).not.toContain('<select');
	expect(body).not.toContain('Entries per page');
});
it('renders no range or size controls after hydration on Search or Inventory', async () => {
	for (const path of ['/mtg/search', '/mtg/inventory?view=groups']) {
		const { body } = await render(NativeRangeNavigation, {
			props: {
				state: parseLazyBrowsePagination(new URLSearchParams()),
				total: 10000,
				canonicalURL: new URL(path, 'https://example.test'),
				native: false
			}
		});
		expect(body).not.toContain('<nav');
		expect(body).not.toContain('<select');
		expect(body).not.toContain('Next');
	}
});
it('omits unavailable links at native first/end/empty ranges', async () => {
	for (const [page, total, previous, next] of [
		[1, 201, false, true],
		[2, 201, true, false],
		[1, 0, false, false]
	] as const) {
		const { body } = await render(NativeRangeNavigation, {
			props: {
				state: parseLazyBrowsePagination(new URLSearchParams({ page: String(page) })),
				total,
				canonicalURL: new URL('https://example.test/mtg/inventory?view=groups&set=dom')
			}
		});
		expect(body.includes('Previous 200 results')).toBe(previous);
		expect(body.includes('Next 200 results')).toBe(next);
	}
});
