import { privateEnv } from '$lib/env/private';
import { buildRobotsTxt } from '$lib/seo/site';

export const GET = () => {
	return new Response(buildRobotsTxt(privateEnv.APP_ORIGIN), {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
};
