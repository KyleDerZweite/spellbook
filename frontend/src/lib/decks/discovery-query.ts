import type { LegalityFormat } from '@spellbook/contracts/catalog.ts';
import type {
	DeckDiscoveryInventoryMode,
	DeckDiscoveryQuery,
	DeckDiscoverySort
} from '@spellbook/contracts/reference-decks.ts';

export const DISCOVERY_PAGE_SIZE = 24;

export const DISCOVERY_SORTS: readonly DeckDiscoverySort[] = [
	'missing_cost:asc',
	'ownership:desc',
	'meta_share:desc',
	'name:asc'
];

export const DISCOVERY_INVENTORY_MODES: readonly DeckDiscoveryInventoryMode[] = ['all', 'free'];

const VALID_FORMATS = new Set<string>([
	'standard',
	'pioneer',
	'modern',
	'legacy',
	'vintage',
	'commander',
	'pauper',
	'brawl'
]);

export interface DiscoveryUrlState {
	format: LegalityFormat | '';
	source: string;
	query: string;
	maxMissingCost: number | null;
	minOwnership: number | null;
	inventoryMode: DeckDiscoveryInventoryMode;
	sort: DeckDiscoverySort;
	page: number;
}

function parseOptionalNumber(raw: string | null, min: number, max: number): number | null {
	if (raw === null) return null;
	const trimmed = raw.trim().replace(',', '.');
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
	return parsed;
}

export function discoveryStateFromParams(params: URLSearchParams): DiscoveryUrlState {
	const rawFormat = (params.get('discFormat') ?? '').trim().toLowerCase();
	const format = VALID_FORMATS.has(rawFormat) ? (rawFormat as LegalityFormat) : '';
	const source = (params.get('discSource') ?? '').trim().slice(0, 64);
	const query = (params.get('discQ') ?? '').trim().slice(0, 200);
	const maxMissingCost = parseOptionalNumber(params.get('discBudget'), 0, 1_000_000);
	const minOwnership = parseOptionalNumber(params.get('discMinOwned'), 0, 100);
	const rawMode = params.get('discMode') ?? 'all';
	const inventoryMode: DeckDiscoveryInventoryMode = rawMode === 'free' ? 'free' : 'all';
	const rawSort = params.get('discSort') ?? 'missing_cost:asc';
	const sort: DeckDiscoverySort = DISCOVERY_SORTS.includes(rawSort as DeckDiscoverySort)
		? (rawSort as DeckDiscoverySort)
		: 'missing_cost:asc';
	const rawPage = Number.parseInt(params.get('discPage') ?? '1', 10);
	const page = Number.isFinite(rawPage) && rawPage >= 1 && rawPage <= 4000 ? rawPage : 1;

	return {
		format,
		source,
		query,
		maxMissingCost,
		minOwnership,
		inventoryMode,
		sort,
		page
	};
}

export function discoveryQueryFromState(state: DiscoveryUrlState): DeckDiscoveryQuery {
	return {
		format: state.format || undefined,
		source: state.source || undefined,
		query: state.query || undefined,
		maxMissingCost: state.maxMissingCost,
		minOwnership: state.minOwnership,
		inventoryMode: state.inventoryMode,
		sort: state.sort,
		limit: DISCOVERY_PAGE_SIZE,
		offset: (state.page - 1) * DISCOVERY_PAGE_SIZE
	};
}

export function discoveryHref(state: Partial<DiscoveryUrlState>): string {
	const params = new URLSearchParams();
	params.set('tab', 'discovery');
	if (state.format) params.set('discFormat', state.format);
	if (state.source) params.set('discSource', state.source);
	if (state.query?.trim()) params.set('discQ', state.query.trim());
	if (state.maxMissingCost !== null && state.maxMissingCost !== undefined) {
		params.set('discBudget', String(state.maxMissingCost));
	}
	if (state.minOwnership !== null && state.minOwnership !== undefined && state.minOwnership > 0) {
		params.set('discMinOwned', String(state.minOwnership));
	}
	if (state.inventoryMode === 'free') params.set('discMode', 'free');
	if (state.sort && state.sort !== 'missing_cost:asc') params.set('discSort', state.sort);
	if (state.page && state.page > 1) params.set('discPage', String(state.page));
	return `/mtg/decks?${params.toString()}`;
}

export function hasActiveDiscoveryFilters(state: DiscoveryUrlState): boolean {
	return Boolean(
		state.format ||
		state.source ||
		state.query ||
		state.maxMissingCost !== null ||
		(state.minOwnership !== null && state.minOwnership > 0) ||
		state.inventoryMode === 'free'
	);
}

export function safeHttpUrl(raw: string | null | undefined): string | null {
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			return parsed.href;
		}
		return null;
	} catch {
		return null;
	}
}
