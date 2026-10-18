import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileModule } from 'svelte/compiler';
import type { Deck, DeckCard, DeckSnapshot } from '@spellbook/contracts/decks.ts';
import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
import type { DeckWholeCategories } from '@spellbook/contracts/whole-categories.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { WorkspaceSavedState, type ReadCause, type ReadLease } from '#lib/saved-state/workspace.ts';
import { readSavedJSON } from '#lib/saved-state/read.ts';
import {
	refreshSelectedDeck,
	SelectedDeckReadError,
	type SelectedDeckContext,
	type SelectedDeckMergeState,
	type SelectedDeckPublication
} from '#lib/decks/selected-refresh.ts';
import {
	acknowledgeCategoryDraft,
	initialCategoryDraft,
	reconcileCategoryDraft
} from '#lib/decks/category-save.ts';
import { DeckSaveLifecycle } from '#lib/decks/save-lifecycle.ts';
import { SelectedDeckOptionalReads } from '#lib/decks/selected-optional-reads.ts';

const terminal = vi.hoisted(() => ({ expire: vi.fn() }));
vi.mock('#lib/saved-state/workspace.svelte.ts', () => ({ workspaceSavedState: terminal }));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
const deck: Deck = {
	id: 'deck',
	accountId: 'account',
	game: 'mtg',
	name: 'Saved',
	format: 'Modern',
	description: 'Saved text',
	descriptionRevision: '2',
	compositionRevision: '3',
	createdAt: '',
	updatedAt: ''
};
const card: DeckCard = {
	id: 'entry',
	accountId: 'account',
	deckId: 'deck',
	game: 'mtg',
	catalogCardId: 'printing',
	canonicalCardId: 'oracle',
	name: 'Card',
	setCode: 'tst',
	imageUri: '',
	quantity: 4,
	role: 'sideboard',
	createdAt: '',
	updatedAt: ''
};
const document: CardDocument = {
	id: 'printing',
	oracle_id: 'oracle',
	name: 'Card',
	lang: 'en',
	released_at: '',
	layout: 'normal',
	mana_cost: '',
	cmc: 0,
	type_line: 'Instant',
	oracle_text: '',
	colors: [],
	color_identity: [],
	keywords: [],
	card_types: ['Instant'],
	rarity: 'common',
	set_code: 'tst',
	set_name: 'Test',
	collector_number: '1',
	image_uri: '',
	image_uri_small: '',
	is_foil_available: true,
	is_nonfoil_available: true,
	legalities: { modern: 'legal' }
};
function snapshot(): DeckSnapshot {
	const estimate = {
		currency: 'EUR' as const,
		coveredValue: '4.00',
		coveredQuantity: 4,
		staleQuantity: 0,
		unknownQuantity: 0,
		totalQuantity: 4,
		complete: true
	};
	return {
		decks: [{ ...deck }],
		deckCards: [{ ...card }],
		deckTotals: { deck: 4 },
		deckCovers: {},
		availability: { entry: { exact: 1, alternate: 1, missing: 2 } },
		ownedPrintings: [{ catalogCardId: 'printing', canonicalCardId: 'oracle', quantity: 1 }],
		ownedByCanonical: { oracle: 2 },
		valueEstimates: {
			evaluatedAt: '2026-10-18T00:00:00Z',
			required: estimate,
			missing: { ...estimate, coveredValue: '2.00', totalQuantity: 2, coveredQuantity: 2 }
		},
		valuationError: null
	};
}
function categories(revision = '4'): DeckEntryCategories {
	return {
		deckId: 'deck',
		initialized: true,
		decisionRevision: revision,
		definitions: [],
		decisions: [{ entryId: 'entry', categoryId: null, state: 'Manual', revision, evidence: null }],
		sourceStatus: { kind: 'Succeeded', sourceTime: '2026-10-18T00:00:00Z' }
	};
}
function whole(revision = '4'): DeckWholeCategories {
	return { deckId: 'deck', initialized: true, decisionRevision: revision, categories: [] };
}
function initial(): SelectedDeckMergeState {
	return {
		confirmedDecks: [{ ...deck, descriptionRevision: '1', compositionRevision: '2' }],
		categories: categories('3'),
		wholeCategories: whole('3'),
		details: {
			name: 'Old',
			nameBase: 'Old',
			format: 'Casual',
			formatBase: 'Casual',
			description: 'Old text',
			descriptionBase: 'Old text',
			descriptionRevision: '1'
		},
		inspector: {
			entryId: 'entry',
			opening: 1,
			quantity: 1,
			quantityBase: 1,
			role: 'main',
			roleBase: 'main'
		}
	};
}
const base = '/api/mobile/v1/mtg/decks/deck';
const full = `${base}?selectedOnly=true`,
	narrow = `${full}&includeLegality=false`;
const entries = `${base}/categories`,
	wholes = `${base}/whole-categories`;
const ownership = '/api/mobile/v1/mtg/decks/ownership?canonicalCardId=oracle';
const search = '/api/mobile/v1/mtg/decks/search?q=Opt';
function held<T>() {
	let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function harness(cause?: ReadCause) {
	let valid = true;
	const context: SelectedDeckContext = {
		accountId: 'account',
		deckId: 'deck',
		flow: '',
		scope: {},
		inspector: { canonicalCardId: 'oracle', opening: 1 },
		search: { query: 'Opt', opening: 1 }
	};
	const state = initial();
	const publications: SelectedDeckPublication[] = [];
	const core = snapshot();
	const replies = new Map<string, unknown>([
		[
			full,
			{
				...core,
				warnings: [{ code: 'format', message: 'Warning' }],
				deckDocuments: { printing: document }
			}
		],
		[narrow, core],
		[entries, categories()],
		[wholes, whole()],
		[ownership, core.ownedPrintings],
		[search, { hits: [document], ownedByCanonical: { oracle: 2 } }]
	]);
	const fetcher = vi.fn(async (path: string, _options?: RequestInit) =>
		Response.json(replies.get(path))
	);
	vi.stubGlobal('fetch', fetcher);
	const lease: ReadLease = {
		signal: new AbortController().signal,
		current: () => valid,
		...(cause ? { cause } : {})
	};
	const input = {
		lease,
		context: () => context,
		read: readSavedJSON,
		state: () => ({
			...state,
			details: state.details && { ...state.details },
			inspector: state.inspector && { ...state.inspector }
		}),
		publish: (value: SelectedDeckPublication) => {
			publications.push(value);
		}
	};
	return {
		input,
		context,
		state,
		publications,
		core,
		replies,
		fetcher,
		invalidate: () => {
			valid = false;
		}
	};
}
async function waitForRead(h: ReturnType<typeof harness>, path: string) {
	await vi.waitFor(() =>
		expect(h.fetcher.mock.calls.some(([called]) => called === path)).toBe(true)
	);
}
function holdDecode(h: ReturnType<typeof harness>, path: string) {
	const body = held<unknown>();
	h.fetcher.mockImplementation(async (url) => {
		const response = Response.json(h.replies.get(url));
		if (url === path) vi.spyOn(response, 'json').mockImplementation(() => body.promise);
		return response;
	});
	return body;
}

function optionalHarness(
	cause: ReadCause = ['decks'],
	searchInputs?: () => { query: string; open: boolean },
	initialSearch?: string
) {
	const h = harness(cause);
	let version = 0;
	const searchInput = { query: 'Opt', open: true };
	const ownershipState: {
		loading: boolean;
		error: string;
		values: DeckSnapshot['ownedPrintings'][];
	} = { loading: false, error: '', values: [] };
	const searchState: {
		loading: boolean;
		error: string;
		values: NonNullable<SelectedDeckPublication['search']>[];
	} = { loading: false, error: '', values: [] };
	const owner = new SelectedDeckOptionalReads({
		route: () => h.context,
		active: (account) => account === 'account',
		inspector: () => h.context.inspector,
		search: () => searchInputs?.() ?? searchInput,
		initialSearch,
		publication: () => {
			const captured = version;
			return () => captured === version;
		},
		read: readSavedJSON,
		ownership: (value) => ownershipState.values.push(value),
		results: (value) => searchState.values.push(value),
		ownershipStatus: (loading, error) => Object.assign(ownershipState, { loading, error }),
		searchStatus: (loading, error) => Object.assign(searchState, { loading, error })
	});
	const input = {
		...h.input,
		context: () => owner.context(),
		publish(value: SelectedDeckPublication) {
			h.input.publish(value);
			if (value.ownership && value.ownershipContext)
				owner.acceptOwnership(value.ownership, value.ownershipContext);
			if (value.search && value.searchContext)
				owner.acceptSearch(value.search, value.searchContext);
		}
	};
	return {
		...h,
		input,
		owner,
		searchInput,
		ownershipState,
		searchState,
		invalidateDirect: () => {
			version++;
		}
	};
}
function holdFirstOptional(h: ReturnType<typeof optionalHarness>, path: string) {
	const body = held<unknown>();
	let first = true;
	h.fetcher.mockImplementation(async (url) => {
		const response = Response.json(h.replies.get(url));
		if (url === path && first) {
			first = false;
			vi.spyOn(response, 'json').mockImplementation(() => body.promise);
		}
		return response;
	});
	return body;
}
class SearchMedia extends EventTarget {
	matches = false;
	change(narrow: boolean) {
		this.matches = narrow;
		this.dispatchEvent(new Event('change'));
	}
}

describe('production selected Deck optional-read owner', () => {
	it('refreshes confirmed Search after Desktop/mobile/Desktop activity replacement', async () => {
		const h = optionalHarness(),
			media = new SearchMedia();
		h.searchInput.open = false;
		h.owner.watchSearchActivity(media);
		await h.owner.submitSearch();
		media.change(true);
		h.replies.set(search, { hits: [document], ownedByCanonical: { oracle: 3 } });
		media.change(false);
		await vi.waitFor(() => expect(h.searchState.values).toHaveLength(2));
		expect(h.searchState.values.at(-1)?.ownedByCanonical).toEqual({ oracle: 3 });
		h.owner.dispose();
	});
	it('refreshes successful SSR Search on activation without a prior client publication', async () => {
		const h = optionalHarness(['inventory'], undefined, 'Opt');
		h.searchInput.open = false;
		await refreshSelectedDeck(h.input);
		expect(h.fetcher.mock.calls.some(([path]) => path === search)).toBe(false);
		h.searchInput.open = true;
		h.owner.searchChanged();
		await vi.waitFor(() => expect(h.searchState.values).toHaveLength(1));
		h.owner.dispose();
	});
	it.each(['query', 'scope', 'clear'] as const)(
		'does not reactivate a confirmed query after %s replacement',
		async (replacement) => {
			const h = optionalHarness();
			await h.owner.submitSearch();
			if (replacement === 'query') {
				h.searchInput.query = 'Other';
				h.owner.searchChanged('query');
			} else if (replacement === 'scope') h.context.scope = {};
			else h.owner.clear();
			h.searchInput.open = false;
			h.owner.searchChanged();
			h.searchInput.open = true;
			h.owner.searchChanged();
			expect(h.fetcher.mock.calls.filter(([path]) => path.includes('/search?'))).toHaveLength(1);
			h.owner.dispose();
		}
	);
	it.each(['direct', 'coordinator'] as const)(
		'refreshes confirmed %s Search on reopening after an inactive Inventory event',
		async (source) => {
			const h = optionalHarness(['inventory']);
			await (source === 'direct' ? h.owner.submitSearch() : refreshSelectedDeck(h.input));
			expect(h.searchState.values).toHaveLength(1);
			h.searchInput.open = false;
			h.owner.searchChanged();
			h.replies.set(search, { hits: [document], ownedByCanonical: { oracle: 3 } });
			await refreshSelectedDeck(h.input);
			expect(h.fetcher.mock.calls.filter(([path]) => path === search)).toHaveLength(1);
			h.searchInput.open = true;
			h.owner.searchChanged();
			await vi.waitFor(() => expect(h.searchState.values).toHaveLength(2));
			expect(h.searchState.values.at(-1)?.ownedByCanonical).toEqual({ oracle: 3 });
			h.owner.dispose();
		}
	);
	it.each([
		['decks', 'inspector', ownership],
		['values', 'inspector', ownership],
		['decks', 'search', search]
	] as const)(
		'replaces held direct %s-topic %s demand and accepts only the final merge',
		async (topic, kind, path) => {
			const h = optionalHarness([topic]),
				body = holdFirstOptional(h, path);
			const direct = kind === 'inspector' ? h.owner.readOwnership() : h.owner.submitSearch();
			await waitForRead(h, path);
			const directSignal = h.fetcher.mock.calls.find(([url]) => url === path)![1]!.signal!;
			h.invalidateDirect();
			expect(h.owner.context()[kind]?.needsRead).toBe(true);
			await refreshSelectedDeck(h.input);
			expect(h.fetcher.mock.calls.filter(([url]) => url === path)).toHaveLength(2);
			expect(h.owner.context()[kind]?.needsRead).toBe(false);
			expect(directSignal.aborted).toBe(true);
			const state = kind === 'inspector' ? h.ownershipState : h.searchState;
			expect(state).toMatchObject({ loading: false, error: '' });
			expect(state.values).toHaveLength(1);
			body.resolve(h.replies.get(path));
			await direct;
			expect(state.values).toHaveLength(1);
			h.owner.dispose();
		}
	);
	it.each(['inspector', 'search'] as const)(
		'consumes a current direct %s error without widening later decks refreshes',
		async (kind) => {
			const h = optionalHarness(),
				path = kind === 'inspector' ? ownership : search;
			h.fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
			await (kind === 'inspector' ? h.owner.readOwnership() : h.owner.submitSearch());
			expect(h.owner.context()[kind]?.needsRead).toBe(false);
			const state = kind === 'inspector' ? h.ownershipState : h.searchState;
			expect(state.loading).toBe(false);
			expect(state.error).toContain('Saved changes could not be loaded');
			await refreshSelectedDeck(h.input);
			expect(h.fetcher.mock.calls.filter(([url]) => url === path)).toHaveLength(1);
			h.owner.dispose();
		}
	);
	it('retains unanswered ownership after a discarded direct reply and failed combined attempt', async () => {
		const h = optionalHarness('full'),
			body = holdFirstOptional(h, ownership);
		const direct = h.owner.readOwnership();
		await waitForRead(h, ownership);
		h.invalidateDirect();
		body.resolve(h.replies.get(ownership));
		await direct;
		expect(h.ownershipState.loading).toBe(true);
		h.fetcher.mockImplementation(async (url) =>
			url === search ? new Response('', { status: 503 }) : Response.json(h.replies.get(url))
		);
		await expect(refreshSelectedDeck(h.input)).rejects.toMatchObject({ phase: 'search' });
		expect(h.publications).toEqual([]);
		expect(h.owner.context().inspector?.needsRead).toBe(true);
		expect(h.ownershipState.loading).toBe(true);
		h.fetcher.mockImplementation(async (url) => Response.json(h.replies.get(url)));
		h.input.lease = { ...h.input.lease, cause: ['decks'] };
		await refreshSelectedDeck(h.input);
		expect(h.ownershipState.loading).toBe(false);
		expect(h.owner.context().inspector?.needsRead).toBe(false);
		h.owner.dispose();
	});
	it.each(['direct', 'coordinator'] as const)(
		'rejects held %s Search after narrow close/reopen with the same query',
		async (source) => {
			const h = optionalHarness(['inventory']),
				body = holdFirstOptional(h, search);
			const work = source === 'direct' ? h.owner.submitSearch() : refreshSelectedDeck(h.input);
			await waitForRead(h, search);
			// A coordinator read alone has no unanswered direct demand to resume.
			if (source === 'coordinator') {
				h.searchInput.open = false;
				h.owner.searchChanged();
				h.searchInput.open = true;
				h.owner.searchChanged();
			} else {
				h.searchInput.open = false;
				h.owner.searchChanged();
				expect(h.owner.context().search).toBeNull();
				await refreshSelectedDeck(h.input);
				expect(h.fetcher.mock.calls.filter(([url]) => url === search)).toHaveLength(1);
				h.searchInput.open = true;
				h.owner.searchChanged();
				await vi.waitFor(() => expect(h.searchState.values).toHaveLength(1));
			}
			body.resolve({ hits: [{ ...document, name: 'Obsolete' }], ownedByCanonical: {} });
			await work;
			expect(
				h.searchState.values.flatMap((value) => value.hits).some((hit) => hit.name === 'Obsolete')
			).toBe(false);
			h.owner.dispose();
		}
	);
	it('restarts unanswered Desktop Search after Desktop/mobile/Desktop ABA and removes its listener', async () => {
		const h = optionalHarness(),
			media = new SearchMedia();
		h.searchInput.open = false;
		h.owner.watchSearchActivity(media);
		const remove = vi.spyOn(media, 'removeEventListener');
		const body = holdFirstOptional(h, search),
			direct = h.owner.submitSearch();
		await waitForRead(h, search);
		const opening = h.owner.context().search!.opening;
		media.change(true);
		expect(h.owner.context().search).toBeNull();
		media.change(false);
		expect(h.owner.context().search!.opening).toBeGreaterThan(opening);
		await vi.waitFor(() => expect(h.searchState.values).toHaveLength(1));
		body.resolve({ hits: [], ownedByCanonical: { obsolete: 1 } });
		await direct;
		expect(h.searchState.values).toHaveLength(1);
		h.owner.dispose();
		expect(remove).toHaveBeenCalledOnce();
		const requests = h.fetcher.mock.calls.length;
		media.change(true);
		media.change(false);
		expect(h.fetcher.mock.calls).toHaveLength(requests);
	});
	it('restarts unanswered Search when a dialog opens during a Desktop request', async () => {
		const h = optionalHarness();
		h.searchInput.open = false;
		h.owner.watchSearchActivity(new SearchMedia());
		const body = holdFirstOptional(h, search),
			direct = h.owner.submitSearch();
		await waitForRead(h, search);
		h.searchInput.open = true;
		h.owner.searchChanged();
		await vi.waitFor(() => expect(h.searchState.values).toHaveLength(1));
		body.reject(Error('obsolete request failed'));
		await direct;
		expect(h.searchState).toMatchObject({ loading: false, error: '' });
		expect(h.owner.context().search?.needsRead).toBe(false);
		h.owner.dispose();
	});
	it('keeps native Search active at narrow width with a closed dialog', async () => {
		const h = optionalHarness(['inventory']);
		h.context.flow = 'search';
		h.searchInput.open = false;
		await refreshSelectedDeck(h.input);
		expect(h.fetcher.mock.calls.map(([path]) => path)).toContain(search);
		h.owner.dispose();
	});
	it('requires manual submission after changing a pending query, including close/reopen and query ABA', async () => {
		const h = optionalHarness(),
			body = holdFirstOptional(h, search);
		const direct = h.owner.submitSearch();
		await waitForRead(h, search);
		for (const query of ['Othe', 'Other']) {
			h.searchInput.query = query;
			h.owner.searchChanged();
		}
		h.searchInput.open = false;
		h.owner.searchChanged();
		h.searchInput.open = true;
		h.owner.searchChanged();
		expect(h.owner.context().search?.needsRead).toBe(false);
		expect(h.fetcher.mock.calls).toHaveLength(1);
		h.searchInput.query = 'Opt';
		h.owner.searchChanged();
		body.resolve(h.replies.get(search));
		await direct;
		expect(h.searchState.values).toEqual([]);
		expect(h.fetcher.mock.calls).toHaveLength(1);
		await h.owner.submitSearch();
		expect(h.searchState.values).toHaveLength(1);
		h.owner.dispose();
	});
	it('allows the normal matrix to read an edited active query without direct submission', async () => {
		const h = optionalHarness(['inventory']);
		h.searchInput.query = 'Other';
		h.owner.searchChanged();
		const path = '/api/mobile/v1/mtg/decks/search?q=Other';
		h.replies.set(path, { hits: [document], ownedByCanonical: {} });
		await refreshSelectedDeck(h.input);
		expect(h.fetcher.mock.calls.map(([url]) => url)).toContain(path);
		h.owner.dispose();
	});
	it.each(['inspector', 'search'] as const)(
		'does not let a discarded direct %s request clean up a newer direct request',
		async (kind) => {
			const h = optionalHarness(),
				path = kind === 'inspector' ? ownership : search,
				oldBody = holdFirstOptional(h, path);
			const older = kind === 'inspector' ? h.owner.readOwnership() : h.owner.submitSearch();
			await waitForRead(h, path);
			const newBody = holdFirstOptional(h, path);
			if (kind === 'inspector') h.context.inspector!.opening++;
			const newer = kind === 'inspector' ? h.owner.readOwnership() : h.owner.submitSearch();
			await vi.waitFor(() => expect(h.fetcher.mock.calls).toHaveLength(2));
			oldBody.reject(Error('old request failed'));
			await older;
			const state = kind === 'inspector' ? h.ownershipState : h.searchState;
			expect(state).toMatchObject({ loading: true, error: '' });
			expect(h.owner.context()[kind]?.needsRead).toBe(true);
			newBody.reject(Error('current request failed'));
			await newer;
			expect(state).toMatchObject({ loading: false, error: 'current request failed' });
			expect(h.owner.context()[kind]?.needsRead).toBe(false);
			h.owner.dispose();
		}
	);
	it('does not let an older coordinator merge or direct completion clean up a newer submission', async () => {
		const h = optionalHarness(['inventory']),
			olderBody = holdFirstOptional(h, search);
		const older = refreshSelectedDeck(h.input);
		await waitForRead(h, search);
		const newerBody = holdFirstOptional(h, search),
			newer = h.owner.submitSearch();
		await vi.waitFor(() =>
			expect(h.fetcher.mock.calls.filter(([url]) => url === search)).toHaveLength(2)
		);
		const signal = h.fetcher.mock.calls.at(-1)![1]!.signal!;
		olderBody.resolve(h.replies.get(search));
		await older;
		expect(signal.aborted).toBe(false);
		expect(h.searchState.loading).toBe(true);
		expect(h.owner.context().search?.needsRead).toBe(true);
		newerBody.resolve(h.replies.get(search));
		await newer;
		expect(h.searchState.loading).toBe(false);
		expect(h.searchState.values).toHaveLength(1);
		h.owner.dispose();
	});
	it.each(['ownership', 'search'] as const)(
		'keeps genuine direct %s 401 under terminal authority',
		async (kind) => {
			const h = optionalHarness();
			h.fetcher.mockResolvedValue(new Response('', { status: 401 }));
			await (kind === 'ownership' ? h.owner.readOwnership() : h.owner.submitSearch());
			expect(terminal.expire).toHaveBeenCalledOnce();
			expect(h.searchState.values).toEqual([]);
			expect(h.ownershipState.values).toEqual([]);
			h.owner.dispose();
		}
	);
	it('clears a current optional error when a later accepted matrix read publishes', async () => {
		const h = optionalHarness(['inventory']);
		h.fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
		await h.owner.submitSearch();
		expect(h.searchState.error).not.toBe('');
		await refreshSelectedDeck(h.input);
		expect(h.searchState).toMatchObject({ loading: false, error: '' });
		expect(h.searchState.values).toHaveLength(1);
		h.owner.dispose();
	});
});

describe('production selected Deck read and publication interface', () => {
	it.each([
		['decks', 'inspector', ownership],
		['values', 'inspector', ownership],
		['decks', 'search', search]
	] as const)('replaces unanswered %s-topic %s demand', async (topic, kind, path) => {
		const h = harness([topic]);
		Object.assign(h.context[kind]!, { needsRead: true });
		await refreshSelectedDeck(h.input);
		expect(h.fetcher.mock.calls.map(([called]) => called)).toContain(path);
		expect(h.publications[0][kind === 'inspector' ? 'ownership' : 'search']).toBeDefined();
	});
	it.each<[ReadCause | undefined, string[]]>([
		[undefined, [full, entries, wholes, ownership, search]],
		['full', [full, entries, wholes, ownership, search]],
		[['decks'], [full, entries, wholes]],
		[['inventory'], [narrow, ownership, search]],
		[['values'], [full, entries, wholes, search]],
		[
			['decks', 'values'],
			[full, entries, wholes, search]
		],
		[
			['decks', 'inventory'],
			[full, entries, wholes, ownership, search]
		],
		[
			['values', 'inventory'],
			[full, entries, wholes, ownership, search]
		],
		[
			['values', 'inventory', 'decks'],
			[full, entries, wholes, ownership, search]
		]
	])('reads the exact matrix for %j', async (cause, paths) => {
		const h = harness(cause);
		expect(await refreshSelectedDeck(h.input)).toBeUndefined();
		expect(h.fetcher.mock.calls.map(([path]) => path)).toEqual(paths);
		expect(h.publications).toHaveLength(1);
		const publication = h.publications[0];
		expect(publication.snapshot).toEqual(h.core);
		expect(publication.snapshot).not.toHaveProperty('warnings');
		expect(publication.optionalLegality).toEqual(
			paths.includes(entries)
				? {
						warnings: [{ code: 'format', message: 'Warning' }],
						deckDocuments: { printing: document }
					}
				: undefined
		);
		expect(publication.categories?.sourceStatus).toEqual(
			paths.includes(entries) ? categories().sourceStatus : undefined
		);
		for (const [, options] of h.fetcher.mock.calls) expect(options?.cache).toBe('no-store');
	});
	it('does no optional work without an active Inspector or query', async () => {
		const h = harness('full');
		h.context.inspector = null;
		h.context.search = null;
		await refreshSelectedDeck(h.input);
		expect(h.fetcher.mock.calls.map(([path]) => path)).toEqual([full, entries, wholes]);
	});
	it('updates only currently clean fields and preserves dirty fields with original bases', async () => {
		const h = harness(['inventory']);
		h.state.details!.name = 'New local name';
		h.state.details!.description = 'Uncertain original text';
		h.state.inspector!.quantity = 9;
		await refreshSelectedDeck(h.input);
		expect(h.publications[0].details).toEqual({ format: 'Modern', formatBase: 'Modern' });
		expect(h.publications[0].inspector).toEqual({ role: 'sideboard', roleBase: 'sideboard' });
		expect(h.state.details!.descriptionBase).toBe('Old text');
		expect(h.state.details!.descriptionRevision).toBe('1');
		expect(h.state.inspector!.quantityBase).toBe(1);
	});
	it.each([ownership, search])(
		'stages everything until the final %s body has decoded',
		async (path) => {
			const h = harness('full');
			if (path === ownership) h.context.search = null;
			const body = holdDecode(h, path);
			const work = refreshSelectedDeck(h.input);
			await waitForRead(h, path);
			expect(h.publications).toEqual([]);
			expect(h.state.categories!.decisionRevision).toBe('3');
			h.state.details!.description = 'Late draft';
			h.state.inspector!.quantity = 19;
			body.resolve(h.replies.get(path));
			expect(await work).toBeUndefined();
			expect(h.publications[0].details).not.toHaveProperty('description');
			expect(h.publications[0].inspector).not.toHaveProperty('quantity');
		}
	);
	it.each(['category', 'whole', 'composition', 'text', 'name', 'quantity', 'role'] as const)(
		'rejects a core that regresses late confirmed %s during the last optional await',
		async (kind) => {
			const h = harness('full');
			const body = holdDecode(h, search),
				work = refreshSelectedDeck(h.input);
			await waitForRead(h, search);
			if (kind === 'category') h.state.categories = categories('5');
			if (kind === 'whole') h.state.wholeCategories = whole('5');
			if (kind === 'composition') h.state.confirmedDecks = [{ ...deck, compositionRevision: '4' }];
			if (kind === 'text') h.state.details!.descriptionRevision = '3';
			if (kind === 'name') h.state.details!.nameBase = 'Confirmed new name';
			if (kind === 'quantity') h.state.inspector!.quantityBase = 7;
			if (kind === 'role') h.state.inspector!.roleBase = 'commander';
			h.state.details!.description = 'Draft after confirmation';
			body.resolve(h.replies.get(search));
			expect(await work).toBe(false);
			expect(h.publications).toEqual([]);
			expect(h.state.details!.description).toBe('Draft after confirmation');
		}
	);
	it.each([ownership, search])(
		'a current optional %s failure blocks every publication and is not Deck deletion',
		async (path) => {
			for (const status of [404, 503]) {
				const h = harness('full');
				h.fetcher.mockImplementation(async (url) =>
					url === path ? new Response('', { status }) : Response.json(h.replies.get(url))
				);
				const error = await refreshSelectedDeck(h.input).catch((cause: unknown) => cause);
				expect(error).toBeInstanceOf(SelectedDeckReadError);
				expect(error).toMatchObject({
					phase: path === ownership ? 'ownership' : 'search',
					deckUnavailable: false
				});
				expect(h.publications).toEqual([]);
			}
		}
	);
	it.each([full, entries, wholes])(
		'tags core phase %s and allows only snapshot404 to mark the Deck gone',
		async (path) => {
			const h = harness('full');
			h.fetcher.mockImplementation(async (url) =>
				url === path ? new Response('', { status: 404 }) : Response.json(h.replies.get(url))
			);
			expect(await refreshSelectedDeck(h.input).catch((cause: unknown) => cause)).toMatchObject({
				deckUnavailable: path === full
			});
			expect(h.publications).toEqual([]);
		}
	);
	it.each(['inspector', 'search'] as const)(
		'discards an A/B/A %s result or irrelevant failure while publishing a valid core',
		async (kind) => {
			for (const failure of [false, true]) {
				const h = harness('full'),
					path = kind === 'inspector' ? ownership : search;
				const body = holdDecode(h, path),
					work = refreshSelectedDeck(h.input);
				await waitForRead(h, path);
				if (kind === 'inspector') {
					h.context.inspector = { canonicalCardId: 'other', opening: 2 };
					h.context.inspector = { canonicalCardId: 'oracle', opening: 3 };
				} else {
					h.context.search = { query: 'Other', opening: 2 };
					h.context.search = { query: 'Opt', opening: 3 };
				}
				if (failure) body.reject(Error('obsolete failure'));
				else body.resolve(h.replies.get(path));
				expect(await work).toBeUndefined();
				expect(h.publications).toHaveLength(1);
				expect(h.publications[0][kind === 'inspector' ? 'ownership' : 'search']).toBeUndefined();
			}
		}
	);
	it('rechecks an earlier optional context after a later optional await', async () => {
		const h = harness('full'),
			body = holdDecode(h, search),
			work = refreshSelectedDeck(h.input);
		await waitForRead(h, search);
		h.context.inspector = { canonicalCardId: 'oracle', opening: 2 };
		body.resolve(h.replies.get(search));
		await work;
		expect(h.publications[0].ownership).toBeUndefined();
	});
	it.each(['account', 'deck', 'flow', 'route', 'lease', 'abort'] as const)(
		'rejects %s replacement before body decode can publish',
		async (kind) => {
			const h = harness('full'),
				body = holdDecode(h, search),
				work = refreshSelectedDeck(h.input);
			await waitForRead(h, search);
			if (kind === 'account') h.context.accountId = 'other';
			if (kind === 'deck') h.context.deckId = 'other';
			if (kind === 'flow') h.context.flow = 'edit';
			if (kind === 'route') h.context.scope = {};
			if (kind === 'lease') h.invalidate();
			if (kind === 'abort') {
				const controller = new AbortController();
				h.input.lease.signal = controller.signal;
				controller.abort();
			}
			body.resolve(h.replies.get(search));
			expect(await work).toBe(false);
			expect(h.publications).toEqual([]);
		}
	);
	it('401 remains owned by the terminal session path', async () => {
		const h = harness('full');
		h.fetcher.mockResolvedValue(new Response('', { status: 401 }));
		expect(await refreshSelectedDeck(h.input)).toBe(false);
		expect(terminal.expire).toHaveBeenCalledOnce();
		expect(h.publications).toEqual([]);
	});
	it('retains confirmed Manual category intent until a matching production read reconciles it', async () => {
		const h = harness(['decks']);
		const draft = acknowledgeCategoryDraft(initialCategoryDraft(undefined, '3'), '', {
			requestId: 'original',
			deckId: 'deck',
			decisionRevision: '4',
			entryIds: ['entry']
		});
		await refreshSelectedDeck(h.input);
		expect(reconcileCategoryDraft(draft, h.publications[0].categories!, 'entry')).toMatchObject({
			dirty: false,
			confirmation: null,
			revision: '4'
		});
	});
	it('late production save acknowledgement retains newer draft B and rejects the older read', async () => {
		const h = harness('full'),
			lifecycle = new DeckSaveLifecycle('account', 'deck');
		lifecycle.open('details');
		const submission = lifecycle.capture('updateDeck');
		const body = holdDecode(h, search),
			work = refreshSelectedDeck(h.input);
		await waitForRead(h, search);
		h.state.details!.description = 'Newer B';
		const confirmation = lifecycle.savedDetails(submission, {
			...deck,
			description: 'Submitted A',
			descriptionRevision: '8'
		});
		expect(confirmation).toBeDefined();
		h.state.details!.descriptionBase = confirmation!.description;
		h.state.details!.descriptionRevision = confirmation!.descriptionRevision;
		body.resolve(h.replies.get(search));
		expect(await work).toBe(false);
		expect(h.publications).toEqual([]);
		expect(h.state.details).toMatchObject({
			description: 'Newer B',
			descriptionBase: 'Submitted A',
			descriptionRevision: '8'
		});
		expect(lifecycle.isCurrent(submission)).toBe(true);
	});
});

it('composes counted Workspace writes, confirmed save bases and the production coordinator across a held reply', async () => {
	const h = harness(),
		listeners = new Map<string, (event: { data: string }) => void>();
	const workspace = new WorkspaceSavedState({
		source: () => ({
			readyState: 1,
			close() {},
			onerror: null,
			addEventListener(name, listener) {
				listeners.set(name, listener);
			}
		}),
		session: async () => 200,
		visible: () => true,
		listen: () => () => {},
		changed() {}
	});
	workspace.start({ accountId: 'account', activation: 'initial' });
	const attempts: ReadLease[] = [];
	const body = holdDecode(h, search);
	const resource = workspace.subscribe({
		topics: ['decks', 'inventory', 'values'],
		clear() {},
		refresh: (lease) => {
			attempts.push(lease);
			return refreshSelectedDeck({ ...h.input, lease });
		}
	});
	try {
		listeners.get('reset')!({ data: '{}' });
		await waitForRead(h, search);
		const deckWrite = resource.beginWrite(['decks']),
			inventoryWrite = workspace.beginWrite(['inventory']);
		expect(attempts[0].current()).toBe(false);
		const lifecycle = new DeckSaveLifecycle('account', 'deck');
		lifecycle.open('details');
		const submission = lifecycle.capture('updateDeck');
		h.state.details!.description = 'Newer B';
		const confirmation = lifecycle.savedDetails(submission, {
			...deck,
			description: 'Confirmed A',
			descriptionRevision: '8'
		});
		h.state.details!.descriptionBase = confirmation!.description;
		h.state.details!.descriptionRevision = confirmation!.descriptionRevision;
		deckWrite.complete();
		deckWrite.complete();
		listeners.get('invalidate')!({ data: '{"topics":["values"]}' });
		expect(attempts).toHaveLength(1);
		h.replies.set(full, {
			...snapshot(),
			decks: [
				{ ...deck, description: 'Confirmed A', descriptionRevision: '8', compositionRevision: '9' }
			],
			warnings: [],
			deckDocuments: { printing: document }
		});
		h.fetcher.mockImplementation(async (path) => Response.json(h.replies.get(path)));
		body.resolve(h.replies.get(search));
		await vi.waitFor(() => expect(resource.getState().refreshing).toBe(false));
		expect(h.publications).toEqual([]);
		inventoryWrite.complete();
		inventoryWrite.complete();
		await vi.waitFor(() => expect(resource.getState().stale).toBe(false));
		expect(attempts).toHaveLength(2);
		expect(attempts[1].cause).toBe('full');
		expect(h.publications).toHaveLength(1);
		expect(h.publications[0].snapshot.decks[0].compositionRevision).toBe('9');
		expect(h.publications[0].details).not.toHaveProperty('description');
		expect(h.state.details).toMatchObject({
			description: 'Newer B',
			descriptionBase: 'Confirmed A',
			descriptionRevision: '8'
		});
	} finally {
		resource.dispose();
		workspace.stop();
	}
});

// Use the real client scheduler for external changes that happen before effects run.
// The fixture only stores owner state and applies the production publication patches.
const clientUrl = import.meta.resolve('svelte/internal/client');
const fixtureCode = compileModule(
	`
 export { flush } from 'svelte/internal/client';
 export function searchInputs() {
  let input = $state({ query: 'Opt', open: true });
  return { get: () => input };
 }
 export function owner(initial, initialContext) {
  let state = $state(initial), context = $state.raw(initialContext), publications = $state(0);
  const observations = [];
  const stop = $effect.root(() => { $effect(() => { observations.push({ publications, name: state.details.name, description: state.details.description, revision: state.categories.decisionRevision }); }); });
  return {
   context: () => context,
   state: () => ({ ...state, details: { ...state.details }, inspector: { ...state.inspector } }),
   edit: () => { state.details.description = 'B typed before scheduler'; state.inspector.quantity = 27; },
   confirm: () => { state.categories = { ...state.categories, decisionRevision: '9' }; state.details.descriptionBase = 'Confirmed A'; state.details.descriptionRevision = '8'; state.confirmedDecks = state.confirmedDecks.map(deck => ({ ...deck, compositionRevision: '9' })); },
   replace: () => { context = { ...context, scope: {} }; },
   publish: value => { if (value.details) Object.assign(state.details, value.details); if (value.inspector) Object.assign(state.inspector, value.inspector); if (value.categories) state.categories = value.categories; publications++; },
   observations, stop
  };
 }`,
	{ filename: 'selected-deck-owner.svelte.js', generate: 'client', dev: false }
).js.code.replaceAll("from 'svelte/internal/client'", `from ${JSON.stringify(clientUrl)}`);
const reactive: {
	flush(): void;
	searchInputs(): { get(): { query: string; open: boolean } };
	owner(
		state: SelectedDeckMergeState,
		context: SelectedDeckContext
	): {
		context(): SelectedDeckContext;
		state(): SelectedDeckMergeState;
		publish(value: SelectedDeckPublication): void;
		edit(): void;
		confirm(): void;
		replace(): void;
		stop(): void;
		observations: { publications: number; name: string; description: string; revision: string }[];
	};
} = await import(
	/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(fixtureCode).toString('base64')
);
it.each(['direct', 'coordinator'] as const)(
	'rejects a held %s Search opening before Svelte effects flush',
	async (source) => {
		const inputs = reactive.searchInputs(),
			h = optionalHarness(['inventory'], inputs.get);
		const body = holdFirstOptional(h, search);
		const work = source === 'direct' ? h.owner.submitSearch() : refreshSelectedDeck(h.input);
		await waitForRead(h, search);
		const opening = h.owner.context().search!.opening;
		inputs.get().open = false;
		h.owner.searchChanged();
		inputs.get().open = true;
		h.owner.searchChanged();
		// No flush between the reactive changes and the production publication check.
		expect(h.owner.context().search!.opening).toBeGreaterThan(opening);
		body.resolve({ hits: [{ ...document, name: 'Obsolete' }], ownedByCanonical: {} });
		await work;
		expect(
			h.searchState.values.flatMap((value) => value.hits).some((hit) => hit.name === 'Obsolete')
		).toBe(false);
		if (source === 'coordinator') expect(h.publications).toHaveLength(1);
		reactive.flush();
		h.owner.dispose();
	}
);
it.each([false, true])(
	'uses current reactive owner state during a held final read, late confirmation=%s',
	async (confirmation) => {
		const h = harness('full'),
			owner = reactive.owner(initial(), h.context);
		try {
			reactive.flush();
			const body = holdDecode(h, search),
				work = refreshSelectedDeck({ ...h.input, ...owner });
			await waitForRead(h, search);
			owner.edit();
			if (confirmation) owner.confirm();
			// Deliberately do not flush. Publication must see changes immediately.
			body.resolve(h.replies.get(search));
			expect(await work).toBe(confirmation ? false : undefined);
			reactive.flush();
			expect(owner.state().details!.description).toBe('B typed before scheduler');
			expect(owner.state().inspector!.quantity).toBe(27);
			expect(owner.observations.at(-1)).toMatchObject({
				publications: confirmation ? 0 : 1,
				revision: confirmation ? '9' : '4'
			});
			if (confirmation)
				expect(owner.state().details).toMatchObject({
					descriptionBase: 'Confirmed A',
					descriptionRevision: '8'
				});
		} finally {
			owner.stop();
		}
	}
);
it('rejects a reactive route replacement synchronously before its effects flush', async () => {
	const h = harness('full'),
		owner = reactive.owner(initial(), h.context);
	try {
		reactive.flush();
		const body = holdDecode(h, search),
			work = refreshSelectedDeck({ ...h.input, ...owner });
		await waitForRead(h, search);
		owner.replace();
		body.resolve(h.replies.get(search));
		expect(await work).toBe(false);
		reactive.flush();
		expect(owner.observations.at(-1)!.publications).toBe(0);
	} finally {
		owner.stop();
	}
});
