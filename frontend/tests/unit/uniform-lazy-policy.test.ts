import { expect, it } from 'vitest';
import {
	parseLazyBrowsePagination,
	browsePaginationHref
} from '../../src/lib/browsing/pagination.ts';
import { parseSearchUrl } from '../../src/lib/search/navigation.ts';
import { inventoryBrowseQuery } from '#lib/server/data/inventory-browsing.ts';

it.each([
	['100', 6, 400],
	['200', 6, 1000],
	['500', 6, 2400],
	['lazy', 6, 1000]
] as const)(
	'normalizes old size %s page %i to the containing 200-result range without earlier reads',
	(size, page, offset) => {
		const params = new URLSearchParams({ pageSize: size, page: String(page) });
		const state = parseLazyBrowsePagination(params, 1_000_000);
		expect(state).toMatchObject({ pageSize: 'lazy', limit: 200, offset });
		const search = parseSearchUrl({ searchParams: params });
		const inventory = inventoryBrowseQuery(new URL('/mtg/inventory?' + params, 'https://local'));
		expect(search.pagination).toEqual(state);
		expect(inventory.pagination).toEqual(state);
		expect(inventory.query).toMatchObject({ offset, limit: 200 });
	}
);
it('rejects an excessive legacy offset before containing-range alignment could make it appear valid', () => {
	expect(
		parseLazyBrowsePagination(new URLSearchParams('pageSize=500&page=2001'), 1_000_000).offset
	).toBe(1_000_000);
	expect(
		parseLazyBrowsePagination(new URLSearchParams('pageSize=500&page=2002'), 1_000_000).offset
	).toBe(0);
});
it('preserves repeated filter/native context while canonical range links replace only addressing', () => {
	const url = new URL(
		'https://local/mtg/search?color=G&color=R&printing=invalid&printing=repeated&deckRetryRequestId=original&pageSize=500&page=2'
	);
	const state = parseLazyBrowsePagination(url.searchParams, 1_000_000);
	const href = browsePaginationHref(url, state);
	const canonical = new URL(href, url);
	expect(canonical.searchParams.getAll('color')).toEqual(['G', 'R']);
	expect(canonical.searchParams.getAll('printing')).toEqual(['invalid', 'repeated']);
	expect(canonical.searchParams.get('deckRetryRequestId')).toBe('original');
	expect(canonical.searchParams.get('page')).toBe('3');
	expect(canonical.searchParams.get('pageSize')).toBe('lazy');
	expect(parseLazyBrowsePagination(canonical.searchParams, 1_000_000)).toEqual(state);
});
it('normalizes repeated or malformed sizes/pages to safe Lazy ranges without discarding other values', () => {
	const params = new URLSearchParams('pageSize=100&pageSize=500&page=3&set=dom&set=lea');
	expect(parseLazyBrowsePagination(params)).toMatchObject({
		pageSize: 'lazy',
		page: 3,
		offset: 400
	});
	expect(params.getAll('set')).toEqual(['dom', 'lea']);
	expect(parseLazyBrowsePagination(new URLSearchParams('page=2&page=3'))).toMatchObject({
		page: 1
	});
});
