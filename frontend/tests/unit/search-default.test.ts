import { expect, it } from 'vitest';
import { parseSearchUrl, searchPagination, searchHref } from '../../src/lib/search/navigation.ts';
import { SearchSession } from '../../src/lib/search/session.svelte.ts';
import { parseBrowsePagination } from '../../src/lib/browsing/pagination.ts';

const url = (query: string) => new URL('/mtg/search' + query, 'https://spellbook.test');
it.each(['', '?pageSize=bogus', '?pageSize=200&pageSize=500', '?pageSize='])(
	'defaults Search URL %s to bounded Lazy',
	(query) => {
		const input = parseSearchUrl(url(query));
		expect(input.pagination).toMatchObject({ pageSize: 'lazy', limit: 200, page: 1, offset: 0 });
		expect(parseSearchUrl(new URL(searchHref(input), 'https://spellbook.test')).pagination).toEqual(
			input.pagination
		);
	}
);
it.each([100, 200, 500, 'lazy'] as const)(
	'normalizes legacy Search size %s to its containing Lazy range on reload',
	(size) => {
		const input = parseSearchUrl(url('?pageSize=' + size + '&page=3'));
		expect(input.pagination).toMatchObject({
			pageSize: 'lazy',
			page: Math.floor((2 * (size === 'lazy' ? 200 : size)) / 200) + 1,
			offset: Math.floor((2 * (size === 'lazy' ? 200 : size)) / 200) * 200
		});
		const reload = parseSearchUrl(new URL(searchHref(input), 'https://spellbook.test'));
		expect(reload.pagination).toEqual(input.pagination);
	}
);
it('uses the same default for a fresh layout session and hydration without explicit pagination', () => {
	const session = new SearchSession();
	expect(session.pagination).toEqual(searchPagination());
	session.hydrate({ query: 'elf', filters: {} });
	expect(session.pagination).toMatchObject({ pageSize: 'lazy', limit: 200, page: 1 });
});
it('keeps default Lazy anchors within the original offset bound', () => {
	expect(parseSearchUrl(url('?page=5001')).pagination).toMatchObject({
		pageSize: 'lazy',
		offset: 1000000
	});
	expect(parseSearchUrl(url('?page=5002')).pagination).toMatchObject({
		pageSize: 'lazy',
		page: 1,
		offset: 0
	});
});
it('keeps the legacy parser compatible while Search normalizes numeric200 to Lazy', () => {
	expect(parseBrowsePagination(new URLSearchParams())).toMatchObject({ pageSize: 200, limit: 200 });
	expect(parseBrowsePagination(new URLSearchParams('pageSize=bad'))).toMatchObject({
		pageSize: 200
	});
	expect(parseSearchUrl(url('?pageSize=200')).pagination).toMatchObject({
		pageSize: 'lazy',
		limit: 200
	});
});
