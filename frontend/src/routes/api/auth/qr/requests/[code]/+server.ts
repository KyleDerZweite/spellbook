import { qrResponse } from '#lib/server/auth/qr.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => qrResponse(event, 'inspect');
