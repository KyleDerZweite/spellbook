import { qrResponse } from '#lib/server/auth/qr.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = (event) => qrResponse(event, 'decide');
