import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCatalogRoutes } from '../../src/http/routes/catalog.ts';
import {
	createHttpFixture,
	context,
	handler,
	publicOrigin,
	user,
	token,
	emptySearch
} from './http-fixture.ts';
const lifetime = await createHttpFixture();
afterAll(() => lifetime.close());
const application = lifetime.application;
const mocks = {
	validateSession: vi.spyOn(application.auth, 'validateSession'),
	searchCatalogRequest: vi.spyOn(application.catalog, 'searchCatalogRequest'),
	getPrintings: vi.spyOn(application.catalog, 'getPrintings')
};
const routes = createCatalogRoutes({ application, publicOrigin });
const GET = handler(routes, 'GET', '/api/mobile/v1/mtg/search');
const POST = handler(routes, 'POST', '/api/mobile/v1/mtg/search');
const publicGet = handler(routes, 'GET', '/api/catalog/search');
const publicPost = handler(routes, 'POST', '/api/catalog/search');
const publicPrintings = handler(routes, 'GET', '/api/catalog/cards/:oracleId/printings');
const cookieToken = 'c'.repeat(43);
function requestContext(
	method: 'GET' | 'POST',
	authenticated = false,
	headers: Record<string, string> = {},
	body: unknown = {}
) {
	return context(
		'/api/mobile/v1/mtg/search',
		method,
		method === 'POST' ? JSON.stringify(body) : undefined,
		{ ...(authenticated ? { cookie: `spellbook_session=${cookieToken}` } : {}), ...headers }
	);
}

describe('catalog search authentication', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateSession.mockImplementation(async (supplied) =>
			supplied === cookieToken ? user : null
		);
		mocks.searchCatalogRequest.mockResolvedValue({
			hits: [],
			query: '',
			estimatedTotalHits: 0,
			processingTimeMs: 0,
			generationId: null
		});
	});

	it('allows public search, facets and printing lookup without a session', async () => {
		expect((await publicGet(requestContext('GET'))).status).toBe(200);
		expect((await publicPost(requestContext('POST'))).status).toBe(200);
		mocks.getPrintings.mockResolvedValue(emptySearch);
		const request = {
			...requestContext('GET'),
			params: { oracleId: '00000000-0000-4000-8000-000000000001' }
		};
		expect((await publicPrintings(request)).status).toBe(200);
		expect(mocks.getPrintings).toHaveBeenCalledWith(request.params.oracleId, 100, 0);
	});

	it('validates the same identity palette for public and authenticated POST', async () => {
		const body = { filters: { colorIdentity: ['R', 'G', 'R'], colors: ['R'] } };
		expect((await publicPost(requestContext('POST', false, {}, body))).status).toBe(200);
		expect(
			(await POST(requestContext('POST', true, { origin: 'https://spellbook.test' }, body))).status
		).toBe(200);
		expect(mocks.searchCatalogRequest.mock.calls.map(([input]) => input.filters)).toEqual([
			{ colorIdentity: ['R', 'G'], colors: ['R'] },
			{ colorIdentity: ['R', 'G'], colors: ['R'] }
		]);
		await expect(
			publicPost(requestContext('POST', false, {}, { filters: { colorIdentity: ['blue'] } }))
		).rejects.toMatchObject({ status: 400 });
		expect(mocks.searchCatalogRequest).toHaveBeenCalledTimes(2);
	});

	it('requires authentication before either search method accesses the catalog', async () => {
		await expect(GET(requestContext('GET'))).rejects.toMatchObject({ status: 401 });
		await expect(POST(requestContext('POST'))).rejects.toMatchObject({ status: 401 });
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('permits cookie GET and same-origin cookie POST', async () => {
		expect((await GET(requestContext('GET', true))).status).toBe(200);
		expect(
			(await POST(requestContext('POST', true, { origin: 'https://spellbook.test' }))).status
		).toBe(200);
		expect(mocks.searchCatalogRequest).toHaveBeenCalledTimes(2);
	});

	it('rejects missing or foreign origins for cookie POST', async () => {
		for (const origin of [undefined, 'https://foreign.test', 'null'])
			await expect(
				POST(requestContext('POST', true, origin ? { origin } : {}))
			).rejects.toMatchObject({
				status: 403
			});
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('accepts a valid native bearer without an Origin header', async () => {
		mocks.validateSession.mockResolvedValue(user);
		expect(
			(await POST(requestContext('POST', false, { authorization: `Bearer ${token}` }))).status
		).toBe(200);
		expect(mocks.validateSession).toHaveBeenCalledWith(token);
	});

	it('rejects an invalid bearer even when a cookie user is available', async () => {
		await expect(
			POST(
				requestContext('POST', true, {
					authorization: `Bearer ${token}`,
					origin: 'https://spellbook.test'
				})
			)
		).rejects.toMatchObject({ status: 401 });
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});
});
