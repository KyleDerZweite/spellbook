import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import Pagination from '../../src/lib/components/ui/pagination/Pagination.svelte';
import { parseBrowsePagination } from '../../src/lib/browsing/pagination.ts';

it('renders a native size form and page links with retained repeated filters', async () => {
	const canonicalURL = new URL(
		'https://example.test/mtg/search?color=R&color=G&offset=100&limit=50'
	);
	const { body } = await render(Pagination, {
		props: {
			state: parseBrowsePagination(new URLSearchParams('pageSize=100&page=2')),
			total: 350,
			canonicalURL
		}
	});
	expect(body).toContain('method="GET"');
	expect(body).toContain('name="color" value="R"');
	expect(body).toContain('name="color" value="G"');
	expect(body).not.toContain('name="offset"');
	expect(body).not.toContain('name="limit"');
	expect(body).toContain('name="page" value="1"');
	expect(body).toContain('Entries per page');
	expect(body).toMatch(/<button[^>]*type="submit"[^>]*>.*Apply.*<\/button>/);
	expect(body).toContain('pageSize=100&amp;page=1');
	expect(body).toContain('pageSize=100&amp;page=3');
	expect(body.replace(/<!--[\s\S]*?-->/g, '')).toContain('Page 2 of 4 (350 entries)');
});

it('keeps Lazy native fallback links even when the enhanced owner will load lazily', async () => {
	const { body } = await render(Pagination, {
		props: {
			state: parseBrowsePagination(new URLSearchParams('pageSize=lazy')),
			total: 1000,
			canonicalURL: new URL('https://example.test/mtg/inventory'),
			lazyLoading: true
		}
	});
	expect(body).toContain('value="lazy" selected');
	expect(body).toContain('pageSize=lazy&amp;page=2');
	expect(body).toMatch(/<a[^>]*href="[^"]*page=2"[^>]*>.*Next.*<\/a>/);
	expect(body).not.toContain('display: none');
});
