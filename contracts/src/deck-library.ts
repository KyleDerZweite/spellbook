import type { Deck, DeckSnapshot } from './decks.ts';

export const DECK_LIBRARY_PAGE_LIMIT = 200;
export type DeckLibrarySort = 'updated:desc' | 'name:asc' | 'name:desc';
export type DeckLibraryQuery = {
	query: string;
	format: string;
	sort: DeckLibrarySort;
	ownership?: 'all' | 'complete' | 'in-progress';
};
export type DeckLibraryInput = Partial<DeckLibraryQuery> & {
	offset?: number;
	limit?: number;
	expectedRevision?: string;
};
export type DeckLibraryItem = Pick<Deck, 'id' | 'name' | 'format' | 'createdAt' | 'updatedAt'> & {
	quantity: number;
	imageUri: string;
	availability?: {
		required: number;
		exact: number;
		alternate: number;
		missing: number;
	};
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
	const sort = value.sort ?? 'updated:desc';
	if (sort !== 'updated:desc' && sort !== 'name:asc' && sort !== 'name:desc')
		throw new Error('Invalid Deck Library sort');
	const ownership = value.ownership ?? 'all';
	if (!['all', 'complete', 'in-progress'].includes(String(ownership)))
		throw new Error('Invalid ownership');
	return {
		...(ownership === 'all' ? {} : { ownership: ownership as 'complete' | 'in-progress' }),
		query: text('query', 200),
		format: text('format', 100),
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
		sort: params.get('dirSort') ?? 'updated:desc',
		ownership: params.get('dirOwnership') ?? 'all'
	});
}
