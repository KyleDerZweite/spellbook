import { proxyApi } from '#lib/server/remote/proxy.ts';
import type { RequestHandler } from './$types';
export const fallback: RequestHandler = (event) => proxyApi(event);
