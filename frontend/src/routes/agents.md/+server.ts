import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(null, { status: 308, headers: { Location: '/llms.txt' } });
