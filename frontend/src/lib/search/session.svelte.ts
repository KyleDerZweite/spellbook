import { getContext, setContext } from 'svelte';
import { CatalogWindow, type CatalogWindowSnapshot, type CatalogRange } from './catalogWindow.ts';
import { SearchFilterState } from './filters.svelte.ts';
import { buildSearchContextKey } from './requestContext.ts';
import { searchHref, type SearchInput } from './navigation.ts';
import type { CardDocument } from './types.ts';

const SEARCH_SESSION = Symbol('search-session');

/** One browser/layout instance owns Search, never a server-global mutable singleton. */
export class SearchSession {
	query = $state('');
	filters = new SearchFilterState(() => this.edited());
	selectedCard: CardDocument | null = $state(null);
	pending = $state(false);
	scrollTop = 0;
	range: CatalogRange = { start: 0, end: 50, direction: 1 };
	snapshot: CatalogWindowSnapshot = $state({
		pages: new Map(),
		total: 0,
		generation: undefined,
		facets: null,
		loading: true,
		error: null,
		reset: 0
	});
	private lastReset = 0;
	catalog = new CatalogWindow((next) => {
		if (next.reset !== this.lastReset) this.scrollTop = 0;
		this.lastReset = next.reset;
		this.snapshot = next;
	});
	private contextKey = '';
	onEdit: () => void = () => {};
	open: (query?: string, trigger?: HTMLElement) => void = () => {};
	focus: () => void = () => {};

	get input(): SearchInput {
		return { query: this.query, filters: this.filters.catalogFilters };
	}

	setQuery(query: string): void {
		this.query = query;
		this.edited();
	}

	hydrate(input: SearchInput): void {
		if (searchHref(input) === searchHref(this.input)) return;
		this.query = input.query;
		this.filters.selectedColors = new Set(input.filters.colorIdentity);
		this.filters.selectedRarities = new Set(input.filters.rarities);
		this.filters.selectedTypes = new Set(input.filters.types);
		this.filters.selectedLegalities = new Set(input.filters.legalities);
		this.selectedCard = null;
		this.scrollTop = 0;
	}

	activate(): void {
		const input = { game: 'mtg' as const, ...this.input, limit: 50 };
		const key = buildSearchContextKey(input);
		if (key !== this.contextKey) {
			this.contextKey = key;
			this.selectedCard = null;
			this.catalog.activate(input);
		} else {
			this.catalog.setRange(this.range);
		}
		this.catalog.resume();
	}

	private edited(): void {
		this.selectedCard = null;
		this.onEdit();
	}
}

export function provideSearchSession(): SearchSession {
	return setContext(SEARCH_SESSION, new SearchSession());
}

export function getSearchSession(): SearchSession {
	return getContext(SEARCH_SESSION);
}
