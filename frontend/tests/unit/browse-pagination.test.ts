import { describe, expect, it } from 'vitest';
import {
	browsePageCount,
	browsePaginationHref,
	clampBrowsePagination,
	parseBrowsePagination
} from '../../src/lib/browsing/pagination.ts';

describe('browser pagination', () => {
	it('defaults to 200 without changing legacy API arguments', () => {
		expect(parseBrowsePagination(new URLSearchParams('offset=700&limit=50'))).toEqual({
			page: 1,
			pageSize: 200,
			limit: 200,
			offset: 0,
			maxOffset: Number.MAX_SAFE_INTEGER
		});
	});
	it.each([
		['100', 100],
		['200', 200],
		['500', 500],
		['lazy', 200]
	])('translates browser size %s to a checked transport limit', (size, limit) => {
		const page = parseBrowsePagination(new URLSearchParams(`pageSize=${size}&page=3`));
		expect(page.limit).toBe(limit);
		expect(page.offset).toBe(2 * limit);
		expect(page.pageSize).toBe(size === 'lazy' ? size : Number(size));
	});
	it.each(['0', '-1', '1.5', '1e3', '+2', ' 2', '', '9007199254740992', '9'.repeat(400)])(
		'rejects invalid or inexact page %s',
		(page) => {
			expect(() => parseBrowsePagination(new URLSearchParams({ page }))).toThrow(RangeError);
		}
	);
	it('accepts decimal leading zeros without accepting other numeric syntax', () => {
		expect(parseBrowsePagination(new URLSearchParams('page=002')).page).toBe(2);
	});
	it.each(['50', '201', 'Lazy', '', '100.0'])('rejects unsupported page size %s', (pageSize) => {
		expect(() => parseBrowsePagination(new URLSearchParams({ pageSize }))).toThrow(RangeError);
	});
	it('rejects repeated authority parameters but permits unrelated repeated filters', () => {
		for (const query of ['page=1&page=2', 'pageSize=100&pageSize=500'])
			expect(() => parseBrowsePagination(new URLSearchParams(query))).toThrow(RangeError);
		expect(parseBrowsePagination(new URLSearchParams('color=R&color=G')).page).toBe(1);
	});
	it('checks arithmetic overflow before returning an offset', () => {
		expect(() => parseBrowsePagination(new URLSearchParams('page=9007199254740991'))).toThrow(
			RangeError
		);
		const page = Math.floor(Number.MAX_SAFE_INTEGER / 200) + 1;
		expect(parseBrowsePagination(new URLSearchParams({ page: String(page) })).offset).toBe(
			(page - 1) * 200
		);
		expect(() => parseBrowsePagination(new URLSearchParams({ page: String(page + 1) }))).toThrow(
			RangeError
		);
	});
	it('respects Search and safe-integer Inventory offset bounds', () => {
		const state = parseBrowsePagination(new URLSearchParams('page=5001'), 1_000_000);
		expect(state.offset).toBe(1_000_000);
		expect(() => parseBrowsePagination(new URLSearchParams('page=5002'), 1_000_000)).toThrow(
			RangeError
		);
		expect(() =>
			browsePaginationHref(new URL('https://example.test/search'), state, { page: 5002 })
		).toThrow(RangeError);
		expect(() => parseBrowsePagination(new URLSearchParams(), Number.MAX_SAFE_INTEGER + 1)).toThrow(
			RangeError
		);
	});
	it('retains repeated query values and hash, removes legacy transport values and does not mutate its URL', () => {
		const url = new URL(
			'https://example.test/mtg/search?q=a+b&color=R&color=G&offset=0&offset=200&limit=50#results'
		);
		const original = url.href;
		const state = parseBrowsePagination(new URLSearchParams('pageSize=100&page=2'));
		const href = browsePaginationHref(url, state, { page: 3 });
		const next = new URL(href, url);
		expect(next.searchParams.get('q')).toBe('a b');
		expect(next.searchParams.getAll('color')).toEqual(['R', 'G']);
		expect(next.searchParams.has('offset')).toBe(false);
		expect(next.searchParams.has('limit')).toBe(false);
		expect(next.searchParams.get('page')).toBe('3');
		expect(next.hash).toBe('#results');
		expect(url.href).toBe(original);
	});
	it.each([100, 500, 'lazy'] as const)(
		'resets to page one when size/mode changes to %s',
		(pageSize) => {
			const state = parseBrowsePagination(new URLSearchParams('page=4'));
			const href = browsePaginationHref(
				new URL('https://example.test/mtg/inventory?group=a'),
				state,
				{ pageSize, page: 9 }
			);
			const next = new URL(href, 'https://example.test');
			expect(next.searchParams.get('page')).toBe('1');
			expect(next.searchParams.get('pageSize')).toBe(String(pageSize));
			expect(next.searchParams.get('group')).toBe('a');
		}
	);
	it('clamps only with a known total, including an empty collection and exact boundaries', () => {
		const state = parseBrowsePagination(new URLSearchParams('pageSize=100&page=8'));
		expect(clampBrowsePagination(state, 201).page).toBe(3);
		expect(clampBrowsePagination(state, 200).page).toBe(2);
		expect(clampBrowsePagination(state, 0).page).toBe(1);
		expect(clampBrowsePagination(state, 1000).page).toBe(8);
		expect(state.page).toBe(8);
		expect(browsePageCount(0, 200)).toBe(1);
		for (const total of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
			expect(() => clampBrowsePagination(state, total)).toThrow(RangeError);
	});
});
