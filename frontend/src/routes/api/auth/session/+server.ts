import type { RequestHandler } from './$types';
import { accountResponse } from '#lib/server/account.ts';
export const GET: RequestHandler = (event) => accountResponse(event, 'session');
