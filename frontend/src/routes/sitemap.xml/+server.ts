import { privateEnv } from '$lib/env/private';
import { buildSitemapXml } from '$lib/seo/site';

export const GET = () => {
	return new Response(buildSitemapXml(privateEnv.APP_ORIGIN), {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8'
		}
	});
};
