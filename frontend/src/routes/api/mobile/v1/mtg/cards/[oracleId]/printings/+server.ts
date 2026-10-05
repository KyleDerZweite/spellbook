import type { RequestHandler } from './$types';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { printingsGet } from '#lib/server/catalog/http.ts';

export const GET: RequestHandler = async (event) => {
	await requireMobileAuth(event);
	return printingsGet(event);
};
