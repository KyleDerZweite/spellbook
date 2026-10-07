import { describe, expect, it, vi } from 'vitest';
import {
	ValidationError,
	assertInventoryOperation,
	assertRequestId,
	normalizeSource,
	INVENTORY_SOURCES
} from '../../src/lib/server/mtg/validation';
import {
	readJsonObject,
	readNumber,
	readQueryInteger,
	readString,
	requireUuid
} from '../../src/lib/server/http/request';
import { parseCatalogSearchRequest } from '../../src/lib/server/catalog/query';

const service = vi.hoisted(() => ({
	createDeckEntry: vi.fn(),
	updateDeckEntry: vi.fn(),
	deleteDeckEntry: vi.fn(),
	updateInventoryEntry: vi.fn(),
	removeInventoryEntry: vi.fn(),
	getInventorySnapshotEntry: vi.fn(),
	batchAddInventory: vi.fn(),
	bulkMutateInventory: vi.fn(),
	getDeckSnapshotEntry: vi.fn(),
	addDeckCardEntry: vi.fn(),
	bulkMutateDeckCards: vi.fn(),
	getDeckCardsEntry: vi.fn(),
	updateDeckCardEntry: vi.fn(),
	removeDeckCardEntry: vi.fn()
}));
const search = vi.hoisted(() => ({
	searchCatalog: vi.fn(),
	searchCatalogRequest: vi.fn(),
	getPrintings: vi.fn()
}));
vi.mock('#lib/server/mobile/auth.ts', () => ({
	requireMobileAuth: vi.fn(async () => ({
		user: { accountId: 'reviewer', username: 'reviewer', email: '' }
	}))
}));
vi.mock('#lib/server/mobile/mtg-service.ts', () => service);
vi.mock('#lib/server/catalog/search.ts', () => search);

import { POST as createDeck } from '../../src/routes/api/mobile/v1/mtg/decks/+server';
import {
	PATCH as updateDeck,
	DELETE as deleteDeck
} from '../../src/routes/api/mobile/v1/mtg/decks/[deckId]/+server';
import { POST as addDeckCard } from '../../src/routes/api/mobile/v1/mtg/decks/[deckId]/cards/+server';
import { POST as bulkDeckCards } from '../../src/routes/api/mobile/v1/mtg/decks/[deckId]/cards/bulk/+server';
import { PATCH as updateDeckCard } from '../../src/routes/api/mobile/v1/mtg/deck-cards/[entryId]/+server';
import { GET as exportDeck } from '../../src/routes/api/mobile/v1/mtg/decks/[deckId]/export/+server';
import { POST as addInventory } from '../../src/routes/api/mobile/v1/mtg/inventory/+server';
import { POST as batchInventory } from '../../src/routes/api/mobile/v1/mtg/inventory/batch-add/+server';
import { POST as bulkInventory } from '../../src/routes/api/mobile/v1/mtg/inventory/bulk/+server';
import { PATCH as updateInventory } from '../../src/routes/api/mobile/v1/mtg/inventory/[entryId]/+server';
import {
	GET as searchCards,
	POST as searchFilteredCards
} from '../../src/routes/api/mobile/v1/mtg/search/+server';
import { GET as printings } from '../../src/routes/api/mobile/v1/mtg/cards/[oracleId]/printings/+server';

const uuid = '11111111-1111-1111-1111-111111111111';
function event(body = '{}', contentType = 'application/json') {
	return {
		request: new Request('http://localhost/api', {
			method: 'POST',
			headers: { 'content-type': contentType },
			body
		}),
		params: { entryId: uuid, deckId: uuid, oracleId: uuid },
		url: new URL('http://localhost/api')
	};
}

describe('bounded JSON requests', () => {
	it('reads a JSON object with a media type parameter', async () => {
		await expect(
			readJsonObject(event('{"quantity":2}', 'application/json; charset=utf-8').request)
		).resolves.toEqual({ quantity: 2 });
	});

	it.each(['{', '', 'null', '[]', '42', '"text"'])(
		'rejects invalid object body %s',
		async (body) => {
			await expect(readJsonObject(event(body).request)).rejects.toMatchObject({ status: 400 });
		}
	);

	it('rejects a different media type', async () => {
		await expect(readJsonObject(event('{}', 'text/plain').request)).rejects.toMatchObject({
			status: 415
		});
	});

	it('counts streamed bytes instead of trusting Content-Length', async () => {
		const cancel = vi.fn();
		let pulls = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulls++;
					controller.enqueue(new Uint8Array(400_000));
				},
				cancel
			},
			{ highWaterMark: 0 }
		);
		const request = new Request('http://localhost/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'content-length': '1' },
			body,
			duplex: 'half'
		} as RequestInit);
		await expect(readJsonObject(request)).rejects.toMatchObject({ status: 413 });
		expect(pulls).toBe(3);
		expect(cancel).not.toHaveBeenCalled();
		expect(request.body?.locked).toBe(false);
	});

	it('accepts the byte limit exactly and counts UTF-8 bytes', async () => {
		const body = JSON.stringify({ value: 'é' });
		const size = new TextEncoder().encode(body).byteLength;
		await expect(readJsonObject(event(body).request, size)).resolves.toEqual({ value: 'é' });
		await expect(readJsonObject(event(body).request, size - 1)).rejects.toMatchObject({
			status: 413
		});
	});
});

describe('mobile route validation', () => {
	const mutations = [
		createDeck,
		updateDeck,
		addDeckCard,
		bulkDeckCards,
		updateDeckCard,
		addInventory,
		batchInventory,
		bulkInventory,
		updateInventory,
		searchFilteredCards
	];
	it.each(mutations)('rejects malformed JSON before mutation', async (handler) => {
		await expect(handler(event('{') as never)).rejects.toMatchObject({ status: 400 });
	});
	it.each(mutations)('requires JSON media type', async (handler) => {
		await expect(handler(event('{}', 'text/plain') as never)).rejects.toMatchObject({
			status: 415
		});
	});
	it.each([
		updateDeck,
		deleteDeck,
		addDeckCard,
		bulkDeckCards,
		updateDeckCard,
		exportDeck,
		updateInventory,
		printings
	])('rejects malformed route UUIDs before database or search access', async (handler) => {
		const request = event();
		request.params = { entryId: 'invalid', deckId: 'invalid', oracleId: 'bad" OR 1=1' };
		await expect(handler(request as never)).rejects.toMatchObject({ status: 400 });
	});

	it.each(['wat', '-1', '1.5', '1e2', '', '101', '9007199254740992'])(
		'rejects invalid search limit %s',
		async (limit) => {
			const request = event();
			request.url.searchParams.set('limit', limit);
			await expect(searchCards(request as never)).rejects.toMatchObject({ status: 400 });
			expect(search.searchCatalogRequest).not.toHaveBeenCalled();
		}
	);

	it('passes valid bounded search pagination to the catalog', async () => {
		search.searchCatalogRequest.mockResolvedValue({ hits: [] });
		const request = event();
		request.url.search = '?q=Opt&limit=0&offset=20';
		await searchCards(request as never);
		expect(search.searchCatalogRequest).toHaveBeenCalledWith({
			query: 'Opt',
			limit: 0,
			offset: 20,
			filters: {},
			facets: false,
			sort: undefined
		});
	});

	it('passes validated rich search options and disables response caching', async () => {
		search.searchCatalogRequest.mockResolvedValue({ hits: [], generationId: null });
		const response = await searchFilteredCards(
			event(
				JSON.stringify({
					query: ' Opt ',
					filters: { colors: ['U'], sets: ['DOM'] },
					facets: true,
					limit: 0
				})
			) as never
		);
		expect(search.searchCatalogRequest).toHaveBeenLastCalledWith({
			query: 'Opt',
			filters: { colors: ['U'], sets: ['dom'] },
			facets: true,
			limit: 0,
			offset: 0,
			sort: undefined
		});
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('rejects rich search validation errors and oversized bodies before catalog access', async () => {
		search.searchCatalogRequest.mockClear();
		await expect(
			searchFilteredCards(event('{"filters":{"toString":["x"]}}') as never)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			searchFilteredCards(event(JSON.stringify({ query: 'x'.repeat(1024 * 1024) })) as never)
		).rejects.toMatchObject({ status: 413 });
		expect(search.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('rejects oversized GET search queries and offsets before catalog access', async () => {
		search.searchCatalogRequest.mockClear();
		for (const query of [
			new URLSearchParams({ q: 'x'.repeat(301) }),
			new URLSearchParams({ offset: '1000001' })
		]) {
			const request = event();
			request.url.search = query.toString();
			await expect(searchCards(request as never)).rejects.toMatchObject({ status: 400 });
		}
		expect(search.searchCatalogRequest).not.toHaveBeenCalled();
	});

	it('rejects null inventory batch items before mutation', async () => {
		await expect(
			addInventory(event('{"requestId":"review","items":[null]}') as never)
		).rejects.toMatchObject({ status: 400 });
		expect(service.batchAddInventory).not.toHaveBeenCalled();
	});

	it.each(['name', 'description', 'format'])('rejects malformed deck %s values', async (field) => {
		for (const value of [null, { toString: null }, {}, [], 123]) {
			await expect(
				createDeck(event(JSON.stringify({ name: 'Deck', [field]: value })) as never)
			).rejects.toMatchObject({ status: 400 });
		}
	});

	it.each(['requestId', 'source'])(
		'rejects malformed bulk %s values before mutation',
		async (field) => {
			await expect(
				bulkInventory(
					event(
						JSON.stringify({ requestId: 'review', [field]: { toString: null }, operations: [] })
					) as never
				)
			).rejects.toMatchObject({ status: 400 });
			expect(service.bulkMutateInventory).not.toHaveBeenCalled();
		}
	);

	it.each(['quantity', 'notes'])('rejects malformed inventory %s values', async (field) => {
		await expect(
			updateInventory(event(JSON.stringify({ quantity: 1, [field]: { toString: null } })) as never)
		).rejects.toMatchObject({ status: 400 });
		expect(service.updateInventoryEntry).not.toHaveBeenCalled();
	});

	it.each([updateInventory, updateDeckCard])(
		'rejects fractional quantities without turning them into removals',
		async (handler) => {
			for (const quantity of [1.5, -0.5])
				await expect(handler(event(JSON.stringify({ quantity })) as never)).rejects.toMatchObject({
					status: 400
				});
		}
	);

	it.each(['quantity', 'notes'])('rejects null inventory %s before mutation', async (field) => {
		service.updateInventoryEntry.mockClear();
		await expect(
			updateInventory(event(JSON.stringify({ quantity: 1, [field]: null })) as never)
		).rejects.toMatchObject({ status: 400 });
		expect(service.updateInventoryEntry).not.toHaveBeenCalled();
	});

	it('omits untouched Inventory quantity and Notes fields instead of resetting them', async () => {
		service.updateInventoryEntry.mockResolvedValue(null);
		await updateInventory(event('{}') as never);
		expect(service.updateInventoryEntry).toHaveBeenLastCalledWith(expect.anything(), {
			requestId: '',
			entryId: uuid,
			source: 'mobile'
		});
	});

	it('preserves the zero quantity removal contract', async () => {
		service.updateInventoryEntry.mockResolvedValue(null);
		await updateInventory(event('{"quantity":0}') as never);
		expect(service.updateInventoryEntry).toHaveBeenCalledWith(expect.anything(), {
			requestId: '',
			entryId: uuid,
			quantity: 0,
			source: 'mobile'
		});
	});

	it.each([createDeck, updateDeck, updateInventory, addDeckCard])(
		'maps domain validation errors to 400',
		async (handler) => {
			for (const method of [
				'createDeckEntry',
				'updateDeckEntry',
				'updateInventoryEntry',
				'addDeckCardEntry'
			] as const)
				service[method].mockRejectedValue(new ValidationError('Invalid mutation'));
			await expect(
				handler(
					event(
						JSON.stringify({ name: 'Deck', catalogCardId: uuid, canonicalCardId: uuid })
					) as never
				)
			).rejects.toMatchObject({ status: 400 });
		}
	);
});

describe('shared parameter validation', () => {
	it('defaults only omitted scalar values', () => {
		expect(readString(undefined, 'name', 'Deck')).toBe('Deck');
		expect(readNumber(undefined, 'quantity', 1)).toBe(1);
		expect(readString('', 'name', 'Deck')).toBe('');
		expect(readNumber(0, 'quantity', 1)).toBe(0);
		expect(() => readString(null, 'name', 'Deck')).toThrow(
			expect.objectContaining({ status: 400 })
		);
		expect(() => readNumber(null, 'quantity', 1)).toThrow(expect.objectContaining({ status: 400 }));
		expect(normalizeSource(undefined, INVENTORY_SOURCES, 'mobile')).toBe('mobile');
		expect(() => normalizeSource(null, INVENTORY_SOURCES, 'mobile')).toThrow(ValidationError);
	});

	it.each([null, undefined])(
		'rejects bulk set quantity %s instead of removing an entry',
		(quantity) => {
			expect(() =>
				assertInventoryOperation({ op: 'set', target: { entryId: uuid }, quantity })
			).toThrow(ValidationError);
		}
	);

	it('rejects invalid nested operation scalars before coercion', () => {
		const malformed = { toString: null };
		const card = { catalogCardId: uuid, canonicalCardId: uuid, name: 'Opt' };
		for (const operation of [
			{
				op: 'add',
				card: { ...card, name: malformed },
				quantity: 1,
				finish: 'nonfoil',
				condition: 'NM'
			},
			{ op: 'add', card, quantity: 1, finish: malformed, condition: 'NM' },
			{ op: 'set', target: { entryId: uuid }, quantity: 1, notes: malformed },
			{ op: 'set', target: { entryId: uuid }, quantity: malformed },
			{ op: 'set', target: { entryId: uuid }, quantity: 1.5 }
		])
			expect(() => assertInventoryOperation(operation)).toThrow(ValidationError);
		expect(() => assertRequestId(malformed)).toThrow(ValidationError);
		expect(() => normalizeSource(malformed, INVENTORY_SOURCES, 'mobile')).toThrow(ValidationError);
	});
	it('accepts UUIDs and rejects coerced values', () => {
		expect(requireUuid(uuid)).toBe(uuid);
		expect(() => requireUuid({ toString: () => uuid })).toThrow();
	});
	it('rejects invalid offsets and keeps defaults for absent parameters', () => {
		expect(readQueryInteger(null, 'offset', 0)).toBe(0);
		for (const value of ['-1', 'NaN', 'Infinity', '0.2', '0x20'])
			expect(() => readQueryInteger(value, 'offset', 0)).toThrow();
	});
});

describe('catalog search request validation', () => {
	it('defaults omitted options and preserves normalized typed filters', () => {
		expect(parseCatalogSearchRequest({})).toEqual({
			query: '',
			filters: {},
			limit: 20,
			offset: 0,
			sort: undefined,
			facets: false
		});
		expect(
			parseCatalogSearchRequest({
				query: '  Opt  ',
				filters: { colors: ['U', 'C', 'U'], colorIdentity: ['R', 'G', 'R'], sets: ['DOM', 'dom'] },
				limit: 0,
				offset: 1_000_000,
				sort: 'name:desc',
				facets: true
			})
		).toEqual({
			query: 'Opt',
			filters: { colors: ['U', 'C'], colorIdentity: ['R', 'G'], sets: ['dom'] },
			limit: 0,
			offset: 1_000_000,
			sort: 'name:desc',
			facets: true
		});
	});

	it.each([
		null,
		[],
		{ unknown: true },
		{ query: null },
		{ query: 1 },
		{ query: 'x'.repeat(301) },
		{ limit: null },
		{ limit: '20' },
		{ limit: 101 },
		{ limit: -1 },
		{ limit: 0.5 },
		{ offset: null },
		{ offset: 1_000_001 },
		{ offset: -1 },
		{ offset: 0.5 },
		{ sort: 'released_at:desc' },
		{ sort: null },
		{ facets: 1 },
		{ facets: null },
		{ filters: null },
		{ filters: [] },
		{ filters: { unknown: [] } },
		{ filters: { toString: ['x'] } },
		{ filters: { constructor: [] } },
		JSON.parse('{"filters":{"__proto__":[]}}'),
		{ filters: { colors: 'U' } },
		{ filters: { colors: ['blue'] } },
		{ filters: { colorIdentity: 'R' } },
		{ filters: { colorIdentity: ['r'] } },
		{ filters: { colorIdentity: ['RG'] } },
		{ filters: { colorIdentity: [null] } },
		{ filters: { colorIdentity: Array(101).fill('R') } },
		{ filters: { rarities: [null] } },
		{ filters: { rarities: ['special'] } },
		{ filters: { types: ['creature'] } },
		{ filters: { legalities: ['future'] } },
		{ filters: { sets: [''] } },
		{ filters: { sets: ['a'.repeat(13)] } },
		{ filters: { sets: ['dom OR true'] } },
		{ filters: { sets: Array(101).fill('dom') } }
	])('rejects malformed catalog requests as domain validation errors: %j', (body) => {
		expect(() => parseCatalogSearchRequest(body)).toThrow(ValidationError);
	});
});
