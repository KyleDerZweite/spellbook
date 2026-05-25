import { privateEnv } from '$lib/env/private';
import { buildRobotsTxt } from '$lib/seo/site';

export const GET = (event?: { url: URL }) => {
	const origin = privateEnv.APP_ORIGIN ?? event?.url.origin;
	if (!origin) {
		throw new Error('APP_ORIGIN or request URL is required to build robots.txt');
	}

	return new Response(buildRobotsTxt(origin), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
};
