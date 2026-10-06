import type { RequestHandler } from './$types';
import { accountResponse } from '#lib/server/account.ts';
export const POST: RequestHandler = (event) => accountResponse(event, 'password');
