import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageMetadata } from '../../src/lib/seo/site';

vi.mock('#lib/env/private.ts', () => ({
	privateEnv: {
		APP_ORIGIN: 'https://spellbook.example.test',
		API_INTERNAL_URL: 'http://127.0.0.1:8080'
	}
}));

import { GET as openapiGet } from '../../src/routes/openapi.json/+server';
import { GET as robotsGet } from '../../src/routes/robots.txt/+server';
import { GET as sitemapGet } from '../../src/routes/sitemap.xml/+server';

describe('crawl and metadata surface', () => {
	afterEach(() => vi.unstubAllGlobals());
	it('serves robots.txt with crawl policy and sitemap URL', async () => {
		const response = await robotsGet();
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(text).toContain('User-agent: *');
		expect(text).toContain('Disallow: /auth/');
		expect(text).toContain('Disallow: /mtg/');
		expect(text).toContain('Disallow: /search');
		expect(text).toContain('Disallow: /inventory');
		expect(text).toContain('Disallow: /decks');
		expect(text).toContain('Disallow: /scan');
		expect(text).toContain('Disallow: /api/');
		expect(text).toContain('Allow: /openapi.json');
		expect(text).toContain('Sitemap: https://spellbook.example.test/sitemap.xml');
		expect(text).not.toContain('Disallow: /openapi.json');
	});

	it('serves sitemap.xml with only the public metadata URLs', async () => {
		const response = await sitemapGet();
		const xml = await response.text();
		const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/xml');
		expect(urls).toEqual([
			'https://spellbook.example.test/',
			'https://spellbook.example.test/privacy',
			'https://spellbook.example.test/terms',
			'https://spellbook.example.test/openapi.json'
		]);
	});

	it('proxies the API-owned OpenAPI schema as public metadata', async () => {
		const schema = {
			info: { title: 'Spellbook OpenAPI Schema' },
			servers: [{ url: 'https://spellbook.example.test' }],
			paths: { '/auth/login': {} }
		};
		const send = vi.fn(async () => Response.json(schema));
		vi.stubGlobal('fetch', send);
		const url = new URL('https://spellbook.example.test/openapi.json');
		const response = await openapiGet({
			url,
			request: new Request(url),
			getClientAddress: () => 'metadata-client'
		} as Parameters<typeof openapiGet>[0]);
		expect(response.status).toBe(200);
		expect(response.headers.get('x-robots-tag')).toBeNull();
		expect(await response.json()).toEqual(schema);
		expect(send).toHaveBeenCalledWith(
			new URL('http://127.0.0.1:8080/openapi.json'),
			expect.objectContaining({ method: 'GET', redirect: 'manual' })
		);
	});

	it('builds consistent canonical metadata for public pages', () => {
		const meta = pageMetadata({
			origin: 'https://spellbook.example.test',
			path: '/privacy',
			title: 'Privacy Policy - Spellbook',
			description: 'How Spellbook handles account data, cookies, and stored inventory.'
		});

		expect(meta.title).toBe('Privacy Policy - Spellbook');
		expect(meta.canonical).toBe('https://spellbook.example.test/privacy');
		expect(meta.url).toBe(meta.canonical);
	});
});
