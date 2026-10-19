import { createApplication } from '../../src/application.ts';
import type { HttpRoute, RouteContext } from '../../src/http/types.ts';

export const publicOrigin = 'https://spellbook.test';
export const user = { accountId: 'reviewer', username: 'reviewer', email: '' };
export const token = 'a'.repeat(43);
export const emptySearch = {
	hits: [],
	query: '',
	estimatedTotalHits: 0,
	processingTimeMs: 0,
	generationId: null
};
export const acknowledgement = {
	requestId: '',
	inventoryId: null,
	revision: '0',
	changes: [],
	removedEntryIds: [],
	groups: [],
	removedGroupIds: [],
	memberships: []
};
export function createHttpFixture() {
	return createApplication({ buildAnalysis: true, valueHistoryEnabled: 'false' });
}
export function handler(routes: HttpRoute[], method: string, path: string): HttpRoute['handle'] {
	const route = routes.find((route) => route.method === method && route.path === path);
	if (!route) throw new Error(`Missing route: ${method} ${path}`);
	return route.handle;
}
export function context(
	path: string,
	method = 'GET',
	body?: string,
	headers: HeadersInit = {},
	params: RouteContext['params'] = {}
): RouteContext {
	const url = new URL(path, publicOrigin);
	return {
		url,
		params,
		clientAddress: 'unit-client',
		request: new Request(url, {
			method,
			headers: { 'content-type': 'application/json', ...headers },
			...(body === undefined ? {} : { body })
		})
	};
}
