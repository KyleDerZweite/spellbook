import { proxyApi } from '#lib/server/remote/proxy.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = (event) => proxyApi(event, '/openapi.json');
