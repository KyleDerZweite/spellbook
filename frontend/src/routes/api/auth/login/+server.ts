import type { RequestHandler } from './$types';
import { authenticateApi } from '$lib/server/auth/api';
export const POST: RequestHandler = (event) => authenticateApi(event, 'login');
