import { privateEnv } from '$lib/env/private';
import { buildSitemapXml } from '$lib/seo/site';

export const GET = (event?: { url: URL }) => {
	const origin = privateEnv.APP_ORIGIN ?? event?.url.origin;
	if (!origin) {
		throw new Error('APP_ORIGIN or request URL is required to build sitemap.xml');
	}

	return new Response(buildSitemapXml(origin), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8'
		}
	});
};
