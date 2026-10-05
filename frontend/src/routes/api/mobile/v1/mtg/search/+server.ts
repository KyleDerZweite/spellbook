import type { RequestHandler } from './$types';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { searchGet, searchPost } from '#lib/server/catalog/http.ts';

export const GET: RequestHandler = async (event) => {
	await requireMobileAuth(event);
	return searchGet(event);
};

export const POST: RequestHandler = async (event) => {
	await requireMobileAuth(event);
	return searchPost(event);
};
