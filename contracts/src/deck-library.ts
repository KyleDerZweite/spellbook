import type { Deck, DeckSnapshot } from './decks.ts';

export const DECK_LIBRARY_PAGE_LIMIT = 200;
export const DECK_LIBRARY_BADGE_LIMIT = 3;
export type DeckLibrarySort = 'updated:desc' | 'name:asc' | 'name:desc';
export type DeckLibraryQuery = {
	query: string;
	format: string;
	categoryVersionIds: string[];
	sort: DeckLibrarySort;
};
export type DeckLibraryInput = Partial<DeckLibraryQuery> & {
	offset?: number;
	limit?: number;
	expectedRevision?: string;
};
export type DeckLibraryBadge = {
	versionId: string;
	originId: string;
	name: string;
	historical: boolean;
};
export type DeckLibraryItem = Pick<Deck, 'id' | 'name' | 'format' | 'createdAt' | 'updatedAt'> & {
	quantity: number;
	imageUri: string;
	categories: DeckLibraryBadge[];
	remainingCategoryCount: number;
};
export type DeckLibraryPage = {
	query: DeckLibraryQuery;
	queryKey: string;
	revision: string;
	offset: number;
	limit: number;
	matchingTotal: number;
	globalTotal: number;
	items: DeckLibraryItem[];
};
export type DeckLibraryCategory = DeckLibraryBadge & {
	meaning: string;
	version: number;
	count: number;
};
export type DeckLibraryCategoryInput = DeckLibraryInput & { selectedVersionIds?: string[] };
export type DeckLibraryCategories = {
	query: DeckLibraryQuery;
	queryKey: string;
	revision: string;
	offset: number;
	limit: number;
	total: number;
	items: DeckLibraryCategory[];
	selected: DeckLibraryCategory[];
};
export type DeckLibraryLocation = {
	query: DeckLibraryQuery;
	queryKey: string;
	revision: string;
	deckId: string;
	offset: number | null;
	matchingTotal: number;
};
export type SelectedDeck = DeckSnapshot;

export function normalizeDeckLibraryQuery(input: unknown = {}): DeckLibraryQuery {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		throw new Error('Invalid Deck Library query');
	const value = input as Record<string, unknown>;
	const text = (key: string, maximum: number) => {
		const item = value[key] ?? '';
		if (typeof item !== 'string' || item.length > maximum || item.includes('\0'))
			throw new Error(`Invalid ${key}`);
		return item.trim().normalize('NFC');
	};
	const versions = value.categoryVersionIds ?? [];
	if (
		!Array.isArray(versions) ||
		versions.length > 100 ||
		versions.some(
			(id) => typeof id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
		)
	)
		throw new Error('Invalid category versions');
	const sort = value.sort ?? 'updated:desc';
	if (sort !== 'updated:desc' && sort !== 'name:asc' && sort !== 'name:desc')
		throw new Error('Invalid Deck Library sort');
	return {
		query: text('query', 200),
		format: text('format', 100),
		categoryVersionIds: [...new Set(versions.map((id: string) => id.toLowerCase()))].sort(),
		sort
	};
}
export function deckLibraryQueryKey(query: DeckLibraryQuery): string {
	return JSON.stringify(normalizeDeckLibraryQuery(query));
}
/** Directory keys are distinct from the selected Deck's Catalog q. */
export function deckLibraryQueryFromParams(params: URLSearchParams): DeckLibraryQuery {
	return normalizeDeckLibraryQuery({
		query: params.get('dirQ') ?? '',
		format: params.get('dirFormat') ?? '',
		categoryVersionIds: params.getAll('dirCategory'),
		sort: params.get('dirSort') ?? 'updated:desc'
	});
}
