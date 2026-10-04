import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ validateSession: vi.fn(), searchCatalogRequest: vi.fn() }));
vi.mock('#lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	validateSession: mocks.validateSession
}));
vi.mock('#lib/server/catalog/search.ts', () => ({
	searchCatalogRequest: mocks.searchCatalogRequest
}));
import { GET, POST } from '../../src/routes/api/mobile/v1/mtg/search/+server';

const user = { accountId: 'catalog-reader', username: 'mage', email: '' };
const token = 'a'.repeat(43);
function event(method: 'GET' | 'POST', authenticated = false, headers: HeadersInit = {}) {
	const url = new URL('https://spellbook.test/api/mobile/v1/mtg/search');
	return {
		url,
		request: new Request(url, {
			method,
			headers: { 'content-type': 'application/json', ...headers },
			...(method === 'POST' ? { body: '{}' } : {})
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
