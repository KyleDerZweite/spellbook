import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Application } from '../src/application.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { WebCommand } from '@spellbook/contracts/web.ts';
import type { HttpRoute, RouteContext } from '../src/http/types.ts';
import { createDeckRoutes } from '../src/http/routes/decks.ts';
import { createCategoryRoutes } from '../src/http/routes/categories.ts';
import { createWebRoutes } from '../src/http/routes/web.ts';
import { errorResponse } from '../src/http/errors.ts';
import {
	CategoryConflict,
	CategoryMergeConflict,
	CategoryNotFound,
	DescriptionConflictError,
	InventoryQuantityChangedError,
	NotesConflictError,
	RequestConflictError,
	ValidationError
} from '../src/transport.ts';

const DECK = '11111111-1111-4111-8111-111111111111';
const ENTRY = '22222222-2222-4222-8222-222222222222';
const PRINTING = '33333333-3333-4333-8333-333333333333';
const CATEGORY = '44444444-4444-4444-8444-444444444444';
const REQUEST = '55555555-5555-4555-8555-555555555555';
const PREVIEW = '66666666-6666-4666-8666-666666666666';
const USER: AuthUser = { accountId: 'test-account', username: 'test-user', email: '' };
const TOKEN = 'a'.repeat(43);
const ORIGIN = 'https://spellbook.test';
const DTO = { original: true, nullable: null, revision: '9007199254740993' };
const OLD_DECK = { id: DECK, name: 'Existing Deck' };
const NEW_DECK = { id: CATEGORY, name: 'Created Deck' };
const SNAPSHOT = { decks: [OLD_DECK], cards: [], selectedDeckId: DECK };
const LEGALITY = { warnings: [], deckDocuments: {} };
type Call = { method: string; args: unknown[] };

function harness() {
	const calls: Call[] = [];
	const tokens: Array<string | undefined> = [];
	const returns = new Map<string, unknown>([
		['decks.getDeckSnapshot', SNAPSHOT],
		['decks.createDeckRecord', NEW_DECK],
		['decks.getDeckLegality', LEGALITY],
		['decks.exportDecklist', '1 Sol Ring\n']
	]);
	const failures = new Map<string, unknown>();
	// Only application use cases are doubled. Parsing, auth policy and error serialization are real.
	const methods = (owner: string, names: string[]) =>
		Object.fromEntries(
			names.map((name) => [
				name,
				async (...args: unknown[]) => {
					const method = `${owner}.${name}`;
					calls.push({ method, args });
					if (failures.has(method)) throw failures.get(method);
					return returns.has(method) ? returns.get(method) : DTO;
				}
			])
		);
	const application = {
		auth: {
			validateSession: async (token: string | undefined) => {
				tokens.push(token);
				return token === TOKEN ? USER : null;
			}
		},
		decks: methods('decks', [
			'getDeckSnapshot',
			'getDeck',
			'getDeckLegality',
			'availability',
			'getDeckLibrary',
			'getDeckLibraryCategories',
			'locateDeck',
			'createDeckRecord',
			'updateDeck',
			'deleteDeck',
			'addDeckCard',
			'updateDeckCard',
			'removeDeckCard',
			'bulkMutateDeckCards',
			'exportDecklist',
			'getDeckChoices',
			'importTextDeck',
			'previewMtgImport',
			'ownership',
			'search',
			'addCatalogCardToDeck',
			'changeDeckPrinting',
			'importIntoDeck'
		]),
		categories: methods('categories', [
			'getLibrary',
			'saveDefinition',
			'archiveDefinition',
			'getCategoryPreview',
			'commitCategoryChange',
			'getRuleChoices',
			'setEntryCategory',
			'getDeckEntryCategories',
			'initializeDeckCategories',
			'previewEntryMerge',
			'previewCategoryChange',
			'getDeckWholeCategories',
			'renameWholeCategory',
			'setWholeCategory',
			'removeWholeCategory',
			'renameLocalCategory',
			'removeLocalCategory',
			'getDefinition'
		]),
		inventory: methods('inventory', ['add', 'patchEntry', 'remove'])
	} as unknown as Application;
	const deps = { application, publicOrigin: ORIGIN };
	const routes = [
		...createDeckRoutes(deps),
		...createCategoryRoutes(deps),
		...createWebRoutes(deps)
	];
	function route(method: string, path: string): HttpRoute {
		const found = routes.find(
			(candidate) => candidate.method === method && candidate.path === path
		);
		assert.ok(found, `Missing ${method} ${path}`);
		return found;
	}
	async function send(
		method: string,
		path: string,
		options: {
			body?: unknown;
			raw?: string | Uint8Array<ArrayBuffer>;
			headers?: HeadersInit;
			query?: string;
		} = {}
	) {
		const url = new URL(
			path.replace(/:([a-zA-Z]+)/g, (_, key) => params[key]),
			ORIGIN
		);
		url.search = options.query ?? '';
		const headers = new Headers(options.headers ?? { authorization: `Bearer ${TOKEN}` });
		let body: BodyInit | undefined = options.raw;
		if (options.body !== undefined) body = JSON.stringify(options.body);
		if (body !== undefined && !headers.has('content-type'))
			headers.set('content-type', 'application/json');
		const context: RouteContext = {
			request: new Request(url, { method, headers, body }),
			url,
			params,
			clientAddress: '127.0.0.1'
		};
		try {
			return await route(method, path).handle(context);
		} catch (cause) {
			return errorResponse(cause);
		}
	}
	return { calls, tokens, returns, failures, routes, send };
}
const params: Record<string, string> = {
	deckId: DECK,
	entryId: ENTRY,
	categoryId: CATEGORY,
	originId: CATEGORY,
	previewId: PREVIEW,
	versionId: CATEGORY
};
const libraryInput = {
	query: '',
	format: '',
	categoryVersionIds: [],
	sort: 'updated:desc',
	offset: 0,
	limit: 40
};
const categoryWrite = { requestId: REQUEST, expectedDecisionRevision: '8' };

interface RouteCase {
	/** Original frontend/src/routes/api/mobile/v1/mtg/<source>/+server.ts, same HTTP method. */
	source: string;
	method: string;
	body?: unknown;
	query?: string;
	calls: Array<[string, ...unknown[]]>;
	response?: unknown;
	cache?: string;
	text?: string;
}
// Explicit original handler -> extracted factory -> original application method trace.
const cases: RouteCase[] = [
	{
		source: 'decks',
		method: 'GET',
		calls: [['decks.getDeckSnapshot', 'mtg', null]],
		response: SNAPSHOT
	},
	{
		source: 'decks',
		method: 'POST',
		body: { name: 'Created Deck' },
		calls: [
			['decks.getDeckSnapshot', 'mtg'],
			[
				'decks.createDeckRecord',
				{ game: 'mtg', name: 'Created Deck', description: '', format: 'Commander' }
			]
		],
		response: [OLD_DECK, NEW_DECK]
	},
	{
		source: 'decks/[deckId]',
		method: 'GET',
		calls: [
			['decks.getDeckSnapshot', 'mtg', DECK],
			['decks.getDeckLegality', DECK]
		],
		response: { ...SNAPSHOT, ...LEGALITY },
		cache: 'no-store'
	},
	{
		source: 'decks/[deckId]',
		method: 'PATCH',
		body: { name: 'Renamed' },
		calls: [['decks.updateDeck', { deckId: DECK, name: 'Renamed' }]]
	},
	{
		source: 'decks/[deckId]',
		method: 'DELETE',
		calls: [['decks.deleteDeck', DECK]],
		response: { ok: true }
	},
	{
		source: 'decks/[deckId]/availability',
		method: 'GET',
		calls: [['decks.availability', DECK]],
		cache: 'no-store'
	},
	{
		source: 'decks/[deckId]/cards',
		method: 'POST',
		body: {
			catalogCardId: PRINTING,
			canonicalCardId: CATEGORY,
			name: 'Sol Ring',
			requestId: REQUEST
		},
		calls: [
			[
				'decks.addDeckCard',
				{
					deckId: DECK,
					catalogCardId: PRINTING,
					canonicalCardId: CATEGORY,
					name: 'Sol Ring',
					setCode: '',
					imageUri: '',
					quantity: 1,
					role: 'main',
					requestId: REQUEST
				}
			]
		]
	},
	{
		source: 'decks/[deckId]/cards/bulk',
		method: 'POST',
		body: { requestId: REQUEST, operations: [] },
		calls: [
			[
				'decks.bulkMutateDeckCards',
				{ deckId: DECK, requestId: REQUEST, source: 'mobile', game: 'mtg', operations: [] }
			]
		]
	},
	{
		source: 'decks/[deckId]/export',
		method: 'GET',
		calls: [['decks.exportDecklist', DECK]],
		text: '1 Sol Ring\n'
	},
	{
		source: 'deck-cards/[entryId]',
		method: 'PATCH',
		body: { requestId: REQUEST, delta: -1 },
		calls: [['decks.updateDeckCard', ENTRY, undefined, undefined, REQUEST, -1, 'mobile', undefined]]
	},
	{
		source: 'deck-cards/[entryId]',
		method: 'DELETE',
		query: `requestId=${REQUEST}`,
		calls: [['decks.removeDeckCard', ENTRY, REQUEST, 'mobile']]
	},
	{
		source: 'decks/choices',
		method: 'GET',
		calls: [
			[
				'decks.getDeckChoices',
				{ query: undefined, offset: 0, limit: 20, selectedDeckId: undefined }
			]
		],
		cache: 'no-store'
	},
	{
		source: 'decks/import/preview',
		method: 'POST',
		body: { text: '1 Sol Ring' },
		calls: [['decks.previewMtgImport', '1 Sol Ring', '']]
	},
	{
		source: 'decks/import/commit',
		method: 'POST',
		body: { requestId: REQUEST, name: 'Import', text: '1 Sol Ring' },
		calls: [
			[
				'decks.importTextDeck',
				{
					requestId: REQUEST,
					source: 'import',
					game: 'mtg',
					name: 'Import',
					description: '',
					format: 'Commander',
					text: '1 Sol Ring'
				}
			]
		]
	},
	{
		source: 'decks/ownership',
		method: 'GET',
		query: `canonicalCardId=${CATEGORY}&canonicalCardId=${PRINTING}`,
		calls: [['decks.ownership', [CATEGORY, PRINTING]]]
	},
	{
		source: 'decks/search',
		method: 'GET',
		query: 'q=Sol+Ring',
		calls: [['decks.search', 'Sol Ring']]
	},
	{ source: 'deck-library', method: 'GET', calls: [['decks.getDeckLibrary', libraryInput]] },
	{
		source: 'deck-library/categories',
		method: 'GET',
		query: `selectedVersionId=${CATEGORY}`,
		calls: [['decks.getDeckLibraryCategories', { ...libraryInput, selectedVersionIds: [CATEGORY] }]]
	},
	{
		source: 'deck-library/locate',
		method: 'GET',
		query: `deckId=${DECK}`,
		calls: [['decks.locateDeck', DECK, libraryInput]]
	},
	{
		source: 'category-definitions',
		method: 'GET',
		calls: [['categories.getLibrary', { scope: undefined, offset: 0, limit: 50 }]]
	},
	{
		source: 'category-definitions',
		method: 'POST',
		body: { requestId: REQUEST },
		calls: [['categories.saveDefinition', { requestId: REQUEST }]]
	},
	{
		source: 'category-definitions/[originId]/archive',
		method: 'POST',
		body: { requestId: REQUEST, expectedLibraryRevision: '9', archived: true },
		calls: [
			[
				'categories.archiveDefinition',
				{ requestId: REQUEST, expectedLibraryRevision: '9', archived: true, originId: CATEGORY }
			]
		]
	},
	{
		source: 'category-previews/[previewId]',
		method: 'GET',
		calls: [['categories.getCategoryPreview', { previewId: PREVIEW, offset: 0, limit: 50 }]]
	},
	{
		source: 'category-previews/[previewId]/commit',
		method: 'POST',
		body: { requestId: REQUEST },
		calls: [['categories.commitCategoryChange', { requestId: REQUEST, previewId: PREVIEW }]]
	},
	{
		source: 'category-rule-choices',
		method: 'GET',
		query: `tagQuery=mana&cardQuery=Sol&outcomeQuery=Infinite&tagId=${CATEGORY}&oracleId=${PRINTING}&outcomeId=2244`,
		calls: [
			[
				'categories.getRuleChoices',
				{
					tagQuery: 'mana',
					cardQuery: 'Sol',
					outcomeQuery: 'Infinite',
					tagIds: [CATEGORY],
					oracleIds: [PRINTING],
					outcomeIds: ['2244']
				}
			]
		]
	},
	{
		source: 'deck-cards/[entryId]/category',
		method: 'PATCH',
		body: { ...categoryWrite, deckId: DECK, categoryId: null },
		calls: [
			[
				'categories.setEntryCategory',
				{ ...categoryWrite, deckId: DECK, categoryId: null, entryId: ENTRY }
			]
		]
	},
	{
		source: 'decks/[deckId]/categories',
		method: 'GET',
		calls: [['categories.getDeckEntryCategories', DECK]]
	},
	{
		source: 'decks/[deckId]/categories/initialize',
		method: 'POST',
		body: { requestId: REQUEST },
		calls: [['categories.initializeDeckCategories', { requestId: REQUEST, deckId: DECK }]]
	},
	{
		source: 'decks/[deckId]/categories/merge-preview',
		method: 'POST',
		body: { entryId: ENTRY, catalogCardId: PRINTING, role: 'main', quantity: 2 },
		calls: [
			[
				'categories.previewEntryMerge',
				{ entryId: ENTRY, catalogCardId: PRINTING, role: 'main', quantity: 2, deckId: DECK }
			]
		]
	},
	{
		source: 'decks/[deckId]/categories/[categoryId]',
		method: 'PATCH',
		body: { ...categoryWrite, name: 'Local label' },
		calls: [
			[
				'categories.renameLocalCategory',
				{ ...categoryWrite, name: 'Local label', deckId: DECK, categoryId: CATEGORY }
			]
		]
	},
	{
		source: 'decks/[deckId]/categories/[categoryId]',
		method: 'DELETE',
		body: { ...categoryWrite, replacementCategoryId: null },
		calls: [
			[
				'categories.removeLocalCategory',
				{ ...categoryWrite, replacementCategoryId: null, deckId: DECK, categoryId: CATEGORY }
			]
		]
	},
	{
		source: 'decks/[deckId]/category-previews',
		method: 'POST',
		body: { requestId: REQUEST, scope: 'entry', mode: 'Review' },
		calls: [
			[
				'categories.previewCategoryChange',
				{ requestId: REQUEST, scope: 'entry', mode: 'Review', deckId: DECK }
			]
		]
	},
	{
		source: 'decks/[deckId]/whole-categories',
		method: 'GET',
		calls: [['categories.getDeckWholeCategories', DECK]]
	},
	{
		source: 'decks/[deckId]/whole-categories/[versionId]',
		method: 'PATCH',
		body: { ...categoryWrite, manual: 'Include' },
		calls: [
			[
				'categories.setWholeCategory',
				{
					requestId: REQUEST,
					deckId: DECK,
					versionId: CATEGORY,
					expectedDecisionRevision: '8',
					manual: 'Include'
				}
			]
		]
	},
	{
		source: 'decks/[deckId]/whole-categories/[versionId]',
		method: 'DELETE',
		body: categoryWrite,
		calls: [
			[
				'categories.removeWholeCategory',
				{ requestId: REQUEST, deckId: DECK, versionId: CATEGORY, expectedDecisionRevision: '8' }
			]
		]
	}
];
const routePath = (source: string) =>
	'/api/mobile/v1/mtg/' + source.replace(/\[([^\]]+)\]/g, ':$1');

describe('Deck and Category original REST route map', () => {
	it('covers every original method exactly once and the two added endpoints', () => {
		const { routes } = harness();
		const mapped = cases.map((item) => `${item.method} ${routePath(item.source)}`);
		assert.equal(mapped.length, 35);
		assert.equal(new Set(mapped).size, mapped.length);
		assert.deepEqual(
			routes.map((item) => `${item.method} ${item.path}`).sort(),
			[
				...mapped,
				'GET /api/mobile/v1/mtg/category-definitions/:originId',
				'POST /api/web/v1/commands'
			].sort()
		);
	});
	for (const item of cases) {
		it(`${item.method} ${item.source}/+server.ts retains its original call and response`, async () => {
			const h = harness();
			const response = await h.send(item.method, routePath(item.source), item);
			assert.equal(response.status, 200);
			if (item.text !== undefined) {
				assert.equal(await response.text(), item.text);
				assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
			} else assert.deepEqual(await response.json(), item.response ?? DTO);
			assert.equal(response.headers.get('cache-control'), item.cache ?? null);
			assert.deepEqual(
				h.calls,
				item.calls.map(([method, ...args]) => ({ method, args: [USER, ...args] }))
			);
			assert.deepEqual(h.tokens, [TOKEN]);
		});
	}
	it('reads an existing definition without provisioning it', async () => {
		const h = harness();
		const response = await h.send('GET', '/api/mobile/v1/mtg/category-definitions/:originId');
		assert.equal(response.status, 200);
		assert.deepEqual(h.calls, [{ method: 'categories.getDefinition', args: [USER, CATEGORY] }]);
	});
	it('preserves selected-only reads and rejects invalid legality flags before loading', async () => {
		const h = harness();
		const path = '/api/mobile/v1/mtg/decks/:deckId';
		const response = await h.send('GET', path, {
			query: 'selectedOnly=true&includeLegality=false'
		});
		assert.deepEqual(await response.json(), DTO);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.deepEqual(h.calls, [{ method: 'decks.getDeck', args: [USER, DECK] }]);
		for (const query of [
			'includeLegality=false',
			'includeLegality=no',
			'includeLegality=true&includeLegality=true',
			'selectedOnly=true&selectedOnly=true&includeLegality=false'
		]) {
			h.calls.length = 0;
			const failure = await h.send('GET', path, { query });
			assert.equal(failure.status, 400);
			assert.deepEqual(await failure.json(), {
				message: 'includeLegality=false requires selectedOnly=true.',
				status: 400
			});
			assert.equal(h.calls.length, 0);
		}
	});
	it('keeps optional Description revision fields absent unless Description changes', async () => {
		const h = harness();
		await h.send('PATCH', '/api/mobile/v1/mtg/decks/:deckId', {
			body: { format: 'Modern', descriptionRevision: 'ignored' }
		});
		assert.deepEqual(h.calls[0], {
			method: 'decks.updateDeck',
			args: [USER, { deckId: DECK, format: 'Modern' }]
		});
		h.calls.length = 0;
		await h.send('PATCH', '/api/mobile/v1/mtg/decks/:deckId', { body: { description: '' } });
		assert.deepEqual(h.calls[0], {
			method: 'decks.updateDeck',
			args: [USER, { deckId: DECK, description: '', descriptionRevision: '' }]
		});
	});
	it('keeps directory normalization, repeated versions and expectedRevision precedence', async () => {
		const h = harness();
		const response = await h.send('GET', '/api/mobile/v1/mtg/deck-library', {
			query: `dirQ=%20Sol%20&dirCategory=${CATEGORY}&dirCategory=${CATEGORY}&revision=2&expectedRevision=3&offset=200&limit=100`
		});
		assert.equal(response.status, 200);
		assert.deepEqual(h.calls[0].args, [
			USER,
			{
				...libraryInput,
				query: 'Sol',
				categoryVersionIds: [CATEGORY],
				expectedRevision: '3',
				offset: 200,
				limit: 100
			}
		]);
		for (const query of ['offset=-1', 'limit=x', 'dirSort=invalid', 'dirCategory=invalid']) {
			assert.equal((await h.send('GET', '/api/mobile/v1/mtg/deck-library', { query })).status, 400);
		}
	});
	it('rejects duplicate, unknown and out-of-range Deck choice fields', async () => {
		const h = harness();
		for (const query of ['query=a&query=b', 'actor=other', 'limit=51', 'offset=1000001']) {
			assert.equal(
				(await h.send('GET', '/api/mobile/v1/mtg/decks/choices', { query })).status,
				400
			);
		}
		assert.equal(h.calls.length, 0);
	});
	it('retains whole-category rename and scope-specific Review/Reset bodies', async () => {
		const h = harness();
		await h.send('PATCH', '/api/mobile/v1/mtg/decks/:deckId/whole-categories/:versionId', {
			body: { ...categoryWrite, name: 'New label' }
		});
		assert.deepEqual(h.calls[0], {
			method: 'categories.renameWholeCategory',
			args: [
				USER,
				{
					requestId: REQUEST,
					deckId: DECK,
					versionId: CATEGORY,
					expectedDecisionRevision: '8',
					name: 'New label'
				}
			]
		});
		for (const scope of ['entry', 'deck'])
			for (const mode of ['Review', 'Reset']) {
				const body = { requestId: REQUEST, scope, mode, restoreOriginIds: [CATEGORY] };
				await h.send('POST', '/api/mobile/v1/mtg/decks/:deckId/category-previews', { body });
				assert.deepEqual(h.calls.at(-1), {
					method: 'categories.previewCategoryChange',
					args: [USER, { ...body, deckId: DECK }]
				});
			}
	});
	it('rejects Category authority fields and oversized bodies before any use case', async () => {
		for (const item of cases.filter(
			(item) =>
				item.body !== undefined &&
				item.calls[0][0].startsWith('categories.') &&
				item.calls[0][0] !== 'categories.saveDefinition'
		)) {
			const h = harness();
			assert.equal(
				(
					await h.send(item.method, routePath(item.source), {
						body: { ...(item.body as object), accountId: 'other' }
					})
				).status,
				400
			);
			assert.equal(h.calls.length, 0);
		}
		const h = harness();
		assert.equal(
			(
				await h.send('POST', '/api/mobile/v1/mtg/decks/:deckId/categories/initialize', {
					body: { requestId: 'x'.repeat(16384) }
				})
			).status,
			413
		);
		assert.equal(
			(
				await h.send('POST', '/api/mobile/v1/mtg/category-definitions', {
					body: { name: 'x'.repeat(65536) }
				})
			).status,
			413
		);
	});
});

const commands: Array<{
	command: WebCommand;
	method: string;
	args?: unknown[];
	response?: unknown;
}> = [
	{
		command: {
			operation: 'inventory.add',
			input: {
				requestId: REQUEST,
				catalogCardId: PRINTING,
				quantity: 2,
				finish: 'nonfoil',
				condition: 'NM'
			}
		},
		method: 'inventory.add'
	},
	{
		command: {
			operation: 'inventory.patchEntry',
			input: { requestId: REQUEST, entryId: ENTRY, delta: -1 }
		},
		method: 'inventory.patchEntry'
	},
	{
		command: {
			operation: 'inventory.remove',
			input: { requestId: REQUEST, entryId: ENTRY, expectedQuantity: 2 }
		},
		method: 'inventory.remove'
	},
	{
		command: {
			operation: 'decks.createRecord',
			input: { game: 'mtg', name: 'Created Deck', description: '', format: 'Commander' }
		},
		method: 'decks.createDeckRecord',
		response: NEW_DECK
	},
	{
		command: {
			operation: 'decks.addCatalogCard',
			input: {
				deckId: DECK,
				catalogCardId: PRINTING,
				quantity: 2,
				role: 'main',
				requestId: REQUEST
			}
		},
		method: 'decks.addCatalogCardToDeck'
	},
	{
		command: {
			operation: 'decks.changePrinting',
			input: {
				entryId: ENTRY,
				catalogCardId: PRINTING,
				quantity: 2,
				role: 'main',
				requestId: REQUEST
			}
		},
		method: 'decks.changeDeckPrinting'
	},
	{
		command: {
			operation: 'decks.updateCard',
			input: { entryId: ENTRY, delta: -1, requestId: REQUEST }
		},
		method: 'decks.updateDeckCard',
		args: [ENTRY, undefined, undefined, REQUEST, -1, 'web', undefined]
	},
	{
		command: { operation: 'decks.removeCard', input: { entryId: ENTRY, requestId: REQUEST } },
		method: 'decks.removeDeckCard',
		args: [ENTRY, REQUEST, 'web']
	},
	{
		command: {
			operation: 'decks.importInto',
			input: { deckId: DECK, text: '1 Sol Ring\r\n', requestId: REQUEST }
		},
		method: 'decks.importIntoDeck'
	}
];
const WEB = '/api/web/v1/commands';
describe('closed web command parser and receipt-preserving dispatch', () => {
	for (const item of commands) {
		it(`${item.command.operation} calls the original method, preserving retries and absent fields`, async () => {
			const h = harness();
			const expected = item.args ?? [
				item.command.operation.startsWith('inventory.')
					? { ...item.command.input, source: 'web' }
					: item.command.input
			];
			for (let retry = 0; retry < 2; retry++) {
				const response = await h.send('POST', WEB, { body: item.command });
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), item.response ?? DTO);
				assert.deepEqual(h.calls.at(-1), { method: item.method, args: [USER, ...expected] });
			}
			assert.deepEqual(h.calls[0], h.calls[1]);
		});
		it(`${item.command.operation} rejects extra keys, authority, missing required fields and wrong types`, async () => {
			const h = harness();
			const input = item.command.input;
			for (const key of [
				'source',
				'actor',
				'accountId',
				'user',
				'authority',
				'method',
				'__proto__'
			]) {
				const response = await h.send('POST', WEB, {
					body: { ...item.command, input: { ...input, [key]: 'other' } }
				});
				assert.equal(response.status, 400, `${item.command.operation} allowed ${key}`);
			}
			for (const [key, value] of Object.entries(input)) {
				for (const wrong of [null, [], {}, typeof value === 'number' ? '2' : 2]) {
					assert.equal(
						(
							await h.send('POST', WEB, {
								body: { ...item.command, input: { ...input, [key]: wrong } }
							})
						).status,
						400,
						`${key} accepted ${JSON.stringify(wrong)}`
					);
				}
				if (
					['delta', 'quantity', 'role'].includes(key) &&
					['inventory.patchEntry', 'decks.updateCard'].includes(item.command.operation)
				)
					continue;
				const missing = { ...input } as Record<string, unknown>;
				delete missing[key];
				assert.equal(
					(await h.send('POST', WEB, { body: { ...item.command, input: missing } })).status,
					400,
					`${key} was defaulted`
				);
			}
			assert.equal(h.calls.length, 0);
		});
	}
	it('rejects arbitrary operations and malformed envelopes without dispatch', async () => {
		const h = harness();
		const bodies: unknown[] = [
			null,
			[],
			{},
			{ operation: 'inventory.add' },
			{ operation: 'inventory.add', input: null },
			{ operation: 'inventory.add', input: [] },
			{ operation: commands[0].command.operation, input: commands[0].command.input, actor: USER }
		];
		for (const operation of [
			'__proto__',
			'constructor',
			'toString',
			'inventory.bulk',
			'auth.authenticate',
			'decks.getDeck',
			1,
			null
		])
			bodies.push({ operation, input: {} });
		for (const body of bodies) assert.equal((await h.send('POST', WEB, { body })).status, 400);
		assert.equal(h.calls.length, 0);
	});
	it('retains explicit empty optional text and opaque retry identifiers without normalizing', async () => {
		const h = harness();
		const input = {
			requestId: '  original request  ',
			entryId: ENTRY,
			notes: '',
			notesRevision: '0'
		};
		await h.send('POST', WEB, { body: { operation: 'inventory.patchEntry', input } });
		assert.deepEqual(h.calls[0], {
			method: 'inventory.patchEntry',
			args: [USER, { ...input, source: 'web' }]
		});
		await h.send('POST', WEB, {
			body: {
				operation: 'decks.changePrinting',
				input: { ...commands[5].command.input, categoryPreview: '' }
			}
		});
		assert.deepEqual(h.calls[1].args[1], { ...commands[5].command.input, categoryPreview: '' });
	});
	it('enforces JSON, valid UTF-8, the 1 MiB body bound and the mtg literal', async () => {
		const h = harness();
		const bearer = { authorization: `Bearer ${TOKEN}` };
		assert.equal(
			(
				await h.send('POST', WEB, {
					raw: '{}',
					headers: { ...bearer, 'content-type': 'text/plain' }
				})
			).status,
			415
		);
		for (const raw of ['{', new Uint8Array([0xff])])
			assert.equal((await h.send('POST', WEB, { raw })).status, 400);
		assert.equal(
			(
				await h.send('POST', WEB, {
					body: {
						operation: 'decks.importInto',
						input: { deckId: DECK, requestId: REQUEST, text: 'x'.repeat(1024 * 1024) }
					}
				})
			).status,
			413
		);
		assert.equal(
			(
				await h.send('POST', WEB, {
					body: { ...commands[3].command, input: { ...commands[3].command.input, game: 'other' } }
				})
			).status,
			400
		);
		assert.equal(h.calls.length, 0);
	});
	it('uses the real credential policy before dispatch and forbids cookie mutation across origins', async () => {
		const authHeaders: Record<string, string>[] = [
			{},
			{ cookie: `spellbook_session=${TOKEN}`, authorization: 'Bearer invalid' },
			{ cookie: `spellbook_session=${TOKEN}`, origin: 'https://other.test' }
		];
		for (const headers of authHeaders) {
			const h = harness();
			const response = await h.send('POST', WEB, { body: commands[0].command, headers });
			assert.equal(
				response.status,
				'cookie' in headers && !('authorization' in headers) ? 403 : 401
			);
			assert.equal(h.calls.length, 0);
			if ('authorization' in headers) assert.deepEqual(h.tokens, [undefined]);
		}
		const h = harness();
		assert.equal(
			(
				await h.send('POST', WEB, {
					body: commands[0].command,
					headers: { cookie: `spellbook_session=${TOKEN}`, origin: ORIGIN }
				})
			).status,
			200
		);
	});
	it('preserves safe conflict recovery fields and keeps infrastructure failures private', async () => {
		const h = harness();
		const latest = { entryId: ENTRY, notes: 'Latest notes', notesRevision: '7' };
		const description = { description: 'Latest Description', descriptionRevision: '12' };
		const conflict = new CategoryConflict({ deckId: DECK } as ConstructorParameters<
			typeof CategoryConflict
		>[0]);
		const merge = new CategoryMergeConflict({ token: PREVIEW } as ConstructorParameters<
			typeof CategoryMergeConflict
		>[0]);
		const failures: Array<[Error, number, Record<string, unknown>]> = [
			[new NotesConflictError(latest), 409, { kind: 'NotesConflict', ...latest }],
			[
				new InventoryQuantityChangedError(null),
				409,
				{ kind: 'QuantityChanged', latestQuantity: null }
			],
			[
				new DescriptionConflictError(description),
				409,
				{ kind: 'DescriptionConflict', ...description }
			],
			[conflict, 409, { kind: 'CategoryConflict', latest: conflict.latest }],
			[merge, 409, { kind: 'CategoryMergeConflict', preview: merge.preview }],
			[new RequestConflictError(), 409, { kind: 'RequestConflict' }],
			[new CategoryNotFound(), 404, { kind: 'NotFound' }],
			[new ValidationError('Invalid quantity'), 400, {}]
		];
		for (const [failure, status, extra] of failures) {
			h.failures.set('inventory.add', failure);
			const response = await h.send('POST', WEB, { body: commands[0].command });
			assert.equal(response.status, status);
			assert.deepEqual(await response.json(), { message: failure.message, ...extra, status });
		}
		h.failures.set('inventory.add', new Error('postgres://private-infrastructure'));
		const response = await h.send('POST', WEB, { body: commands[0].command });
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { message: 'Internal Server Error', status: 500 });
	});
});
