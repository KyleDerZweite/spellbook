export const SITE_NAME = 'Spellbook';
export const SITE_DESCRIPTION = 'MTG-first, multi-TCG-ready inventory and deck companion';
export const SITE_THEME_COLOR = '#0d0b0f';
export const NO_INDEX_ROBOTS_TAG = 'noindex, nofollow';

export const PUBLIC_METADATA_PAGES = [
	{
		path: '/',
		title: 'Spellbook | Choose Your Game',
		description: SITE_DESCRIPTION
	},
	{
		path: '/privacy',
		title: 'Privacy Policy - Spellbook',
		description: 'How Spellbook handles account data, cookies, and stored inventory.'
	},
	{
		path: '/terms',
		title: 'Terms of Service - Spellbook',
		description: 'The terms that govern use of this Spellbook instance.'
	},
	{
		path: '/openapi.json',
		title: 'Spellbook OpenAPI Schema',
		description: 'Machine-readable schema for the Spellbook frontend and auth endpoints.'
	}
] as const;

export const PUBLIC_INDEXABLE_PATHS = PUBLIC_METADATA_PAGES.map((page) => page.path);
export const ROBOTS_DISALLOWED_PATHS = ['/auth/', '/mtg/', '/collections/', '/search', '/api/'];

export interface PageMetadataInput {
	origin: string;
	path: string;
	title: string;
	description: string;
}

export function absoluteUrl(origin: string, path: string): string {
	return new URL(path, origin).toString();
}

export function pageMetadata({ origin, path, title, description }: PageMetadataInput) {
	const canonical = absoluteUrl(origin, path);

	return {
		canonical,
		description,
		siteName: SITE_NAME,
		title,
		url: canonical
	};
}

export function buildRobotsTxt(origin: string): string {
	return [
		'User-agent: *',
		...ROBOTS_DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
		`Allow: /openapi.json`,
		`Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
		''
	].join('\n');
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export function buildSitemapXml(origin: string): string {
	const entries = PUBLIC_INDEXABLE_PATHS.map((path) => {
		return `  <url><loc>${escapeXml(absoluteUrl(origin, path))}</loc></url>`;
	}).join('\n');

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		entries,
		'</urlset>',
		''
	].join('\n');
}

export function createNoIndexRedirect(location: string, status = 302): Response {
	return new Response(null, {
		status,
		headers: {
			Location: location,
			'X-Robots-Tag': NO_INDEX_ROBOTS_TAG
		}
	});
}
