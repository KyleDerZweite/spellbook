import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	validateSession: vi.fn(),
	searchCatalogRequest: vi.fn(),
	getPrintings: vi.fn()
}));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	validateSession: mocks.validateSession
}));
vi.mock('#lib/server/catalog/search.ts', () => ({
	searchCatalogRequest: mocks.searchCatalogRequest,
	getPrintings: mocks.getPrintings
}));
import { GET, POST } from '../../src/routes/api/mobile/v1/mtg/search/+server';

import { GET as publicGet, POST as publicPost } from '../../src/routes/api/catalog/search/+server';
import { GET as publicPrintings } from '../../src/routes/api/catalog/cards/[oracleId]/printings/+server';

const user = { accountId: 'catalog-reader', username: 'mage', email: '' };
const token = 'a'.repeat(43);
function event(
	method: 'GET' | 'POST',
	authenticated = false,
	headers: HeadersInit = {},
	body: unknown = {}
) {
	const url = new URL('https://spellbook.test/api/mobile/v1/mtg/search');
	return {
		url,
		request: new Request(url, {
			method,
			headers: { 'content-type': 'application/json', ...headers },
			...(method === 'POST' ? { body: JSON.stringify(body) } : {})
		}),
		locals: { user: authenticated ? user : null }
	};
}

describe('catalog search authentication', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.validateSession.mockResolvedValue(null);
		mocks.searchCatalogRequest.mockResolvedValue({
			hits: [],
			query: '',
			estimatedTotalHits: 0,
			processingTimeMs: 0,
			generationId: null
		});
	});

	it('allows public search, facets and printing lookup without a session', async () => {
		expect((await publicGet(event('GET') as never)).status).toBe(200);
		expect((await publicPost(event('POST') as never)).status).toBe(200);
		mocks.getPrintings.mockResolvedValue({ hits: [] });
		const request = {
			...event('GET'),
			params: { oracleId: '00000000-0000-4000-8000-000000000001' }
		};
		expect((await publicPrintings(request as never)).status).toBe(200);
		expect(mocks.getPrintings).toHaveBeenCalledWith(request.params.oracleId, 100, 0);
	});

	it('validates the same identity palette for public and authenticated POST', async () => {
		const body = { filters: { colorIdentity: ['R', 'G', 'R'], colors: ['R'] } };
		expect((await publicPost(event('POST', false, {}, body) as never)).status).toBe(200);
		expect(
			(await POST(event('POST', true, { origin: 'https://spellbook.test' }, body) as never)).status
		).toBe(200);
		expect(mocks.searchCatalogRequest.mock.calls.map(([input]) => input.filters)).toEqual([
			{ colorIdentity: ['R', 'G'], colors: ['R'] },
			{ colorIdentity: ['R', 'G'], colors: ['R'] }
		]);
		await expect(
			publicPost(event('POST', false, {}, { filters: { colorIdentity: ['blue'] } }) as never)
		).rejects.toMatchObject({ status: 400 });
		expect(mocks.searchCatalogRequest).toHaveBeenCalledTimes(2);
	});

	it('requires authentication before either search method accesses the catalog', async () => {
		await expect(GET(event('GET') as never)).rejects.toMatchObject({ status: 401 });
		await expect(POST(event('POST') as never)).rejects.toMatchObject({ status: 401 });
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('permits cookie GET and same-origin cookie POST', async () => {
		expect((await GET(event('GET', true) as never)).status).toBe(200);
		expect(
			(await POST(event('POST', true, { origin: 'https://spellbook.test' }) as never)).status
		).toBe(200);
		expect(mocks.searchCatalogRequest).toHaveBeenCalledTimes(2);
	});

	it('rejects missing or foreign origins for cookie POST', async () => {
		for (const origin of [undefined, 'https://foreign.test', 'null'])
			await expect(
				POST(event('POST', true, origin ? { origin } : {}) as never)
			).rejects.toMatchObject({
				status: 403
			});
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('accepts a valid native bearer without an Origin header', async () => {
		mocks.validateSession.mockResolvedValue(user);
		expect(
			(await POST(event('POST', false, { authorization: `Bearer ${token}` }) as never)).status
		).toBe(200);
		expect(mocks.validateSession).toHaveBeenCalledWith(token);
	});

	it('rejects an invalid bearer even when a cookie user is available', async () => {
		await expect(
			POST(
				event('POST', true, {
					authorization: `Bearer ${token}`,
					origin: 'https://spellbook.test'
				}) as never
			)
		).rejects.toMatchObject({ status: 401 });
		expect(mocks.searchCatalogRequest).not.toHaveBeenCalled();
	});
});
