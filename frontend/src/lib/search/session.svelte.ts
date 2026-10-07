import { getContext, setContext } from 'svelte';
import { CatalogWindow, type CatalogWindowSnapshot, type CatalogRange } from './catalogWindow.ts';
import { SearchFilterState } from './filters.svelte.ts';
import { buildSearchContextKey } from './requestContext.ts';
import { searchHref, SEARCH_MAX_OFFSET, searchPagination, type SearchInput } from './navigation.ts';
import { parseBrowsePagination, type BrowsePagination } from '#lib/browsing/pagination.ts';
import type { CardDocument, SearchResult } from './types.ts';

const SEARCH_SESSION = Symbol('search-session');
const initialPagination = () => parseBrowsePagination(new URLSearchParams(), SEARCH_MAX_OFFSET);
export type SearchHistoryIntent = 'replace' | 'push';

/** One browser/layout instance owns Search, never a server-global mutable singleton. */
export class SearchSession {
	query = $state('');
	pagination: BrowsePagination = $state(initialPagination());
	filters = new SearchFilterState(() => this.edited('push'));
	selectedCard: CardDocument | null = $state(null);
	pending = $state(false);
	scrollTop = 0;
	range: CatalogRange = { start: 0, end: 200, direction: 1 };
	snapshot: CatalogWindowSnapshot = $state({
		pages: new Map(),
		total: 0,
		generation: undefined,
		facets: null,
		loading: true,
		error: null,
		reset: 0
	});
	private positions = new Map<string, number>();
	private address = '';
	private needsAnchor = false;
	private contextKey = '';
	catalog = new CatalogWindow((next) => {
		if (next.publicationReset !== this.snapshot.publicationReset && next.publicationReset) {
			this.scrollTop = 0;
			if (!this.pending) this.selectedCard = null;
		}
		if (next.anchor !== undefined && next.anchor !== this.pagination.offset) {
			this.pagination = searchPagination(
				this.pagination.pageSize,
				Math.floor(next.anchor / this.pagination.limit) + 1
			);
			this.onEdit('replace');
		}
		this.snapshot = next;
	});
	onEdit: (intent: SearchHistoryIntent) => void = () => {};
	open: (query?: string, trigger?: HTMLElement) => void = () => {};
	focus: () => void = () => {};
	get input(): SearchInput {
		return { query: this.query, filters: this.filters.catalogFilters, pagination: this.pagination };
	}
	setQuery(query: string): void {
		this.rememberPosition();
		this.query = query;
		this.edited('replace');
	}
	submit(): void {
		this.edited('push');
	}
	navigate(input: SearchInput): void {
		this.hydrate(input);
		this.scrollTop = 0;
		this.onEdit('push');
	}
	rememberPosition(): void {
		const key = this.address || searchHref(this.input);
		this.positions.delete(key);
		this.positions.set(key, this.scrollTop);
		while (this.positions.size > 40) this.positions.delete(this.positions.keys().next().value!);
	}
	hydrate(input: SearchInput): void {
		input = { ...input, pagination: input.pagination ?? initialPagination() };
		const address = searchHref(input);
		if (address === searchHref(this.input)) {
			this.address = address;
			return;
		}
		this.rememberPosition();
		this.query = input.query;
		this.pagination = input.pagination!;
		this.filters.selectedColors = new Set(input.filters.colorIdentity);
		this.filters.selectedRarities = new Set(input.filters.rarities);
		this.filters.selectedTypes = new Set(input.filters.types);
		this.filters.selectedLegalities = new Set(input.filters.legalities);
		this.selectedCard = null;
		this.scrollTop = this.positions.get(address) ?? 0;
		this.range = {
			start: this.pagination.offset,
			end: this.pagination.offset + this.pagination.limit,
			direction: 1
		};
		this.needsAnchor = true;
		this.address = address;
	}
	activate(seed?: SearchResult): void {
		const input = {
			game: 'mtg' as const,
			...this.input,
			limit: this.pagination.limit,
			offset: this.pagination.offset,
			browsingMode: this.pagination.pageSize === 'lazy' ? ('lazy' as const) : ('numeric' as const)
		};
		const key = buildSearchContextKey(input);
		if (key !== this.contextKey) {
			this.contextKey = key;
			this.selectedCard = null;
			this.catalog.activate(input);
		} else if (this.needsAnchor || this.pagination.pageSize !== 'lazy') {
			this.catalog.dispose();
			this.catalog.setAnchor(this.pagination.offset);
		}
		const seeded = seed ? this.catalog.seed(seed) : false;
		this.needsAnchor = false;
		this.catalog.setRange(this.range);
		if (seeded) this.catalog.start();
		else this.catalog.resume();
	}
	setRange(range: CatalogRange): void {
		this.range = range;
		if (this.pagination.pageSize === 'lazy') {
			const page = Math.min(
				Math.floor(SEARCH_MAX_OFFSET / 200) + 1,
				Math.floor(range.start / 200) + 1
			);
			if (page !== this.pagination.page) {
				this.pagination = searchPagination('lazy', page);
				this.address = searchHref(this.input);
				this.onEdit('replace');
			}
		}
		this.catalog.setRange(range);
	}
	private edited(intent: SearchHistoryIntent): void {
		this.rememberPosition();
		this.selectedCard = null;
		this.pagination = searchPagination(this.pagination.pageSize, 1);
		this.scrollTop = 0;
		this.range = { start: 0, end: this.pagination.limit, direction: 1 };
		this.needsAnchor = true;
		this.onEdit(intent);
		this.address = searchHref(this.input);
	}
}
export function provideSearchSession(): SearchSession {
	return setContext(SEARCH_SESSION, new SearchSession());
}
export function getSearchSession(): SearchSession {
	return getContext(SEARCH_SESSION);
}
