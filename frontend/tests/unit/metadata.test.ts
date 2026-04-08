import { describe, expect, it, vi } from 'vitest';
import { pageMetadata } from '../../src/lib/seo/site';

vi.mock('$lib/env/private', () => ({
	privateEnv: {
		APP_ORIGIN: 'https://spellbook.example.test'
	}
}));

import { GET as openapiGet } from '../../src/routes/openapi.json/+server';
import { GET as robotsGet } from '../../src/routes/robots.txt/+server';
import { GET as sitemapGet } from '../../src/routes/sitemap.xml/+server';

describe('crawl and metadata surface', () => {
	it('serves robots.txt with crawl policy and sitemap URL', async () => {
		const response = await robotsGet();
		const text = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(text).toContain('User-agent: *');
		expect(text).toContain('Disallow: /auth/');
		expect(text).toContain('Disallow: /mtg/');
		expect(text).toContain('Disallow: /collections/');
		expect(text).toContain('Disallow: /search');
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

	it('serves the OpenAPI schema as public metadata', async () => {
		const response = await openapiGet();
		const schema = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('x-robots-tag')).toBeNull();
		expect(schema.info.title).toBe('Spellbook OpenAPI Schema');
		expect(schema.servers[0].url).toBe('https://spellbook.example.test');
		expect(schema.paths['/auth/login']).toBeDefined();
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
