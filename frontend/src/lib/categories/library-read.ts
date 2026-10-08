import type { CategoryLibraryPage } from '@spellbook/contracts/category-library.ts';

/** Capture the requested page and its ownership together. */
export function captureCategoryLibraryQuery(
	accountId: string,
	scope: string,
	page: Pick<CategoryLibraryPage, 'offset' | 'limit'>
) {
	const { offset, limit } = page;
	return Object.freeze({ scope, offset, limit, key: `${accountId}:${scope}:${offset}:${limit}` });
}

/** A scoped list response has authority only over the page that requested it. */
export async function readCategoryLibraryPage(
	query: { scope: string; offset: number; limit: number; signal?: AbortSignal },
	request: typeof fetch,
	current: () => boolean
): Promise<CategoryLibraryPage | null> {
	const response = await request(
		`/api/mobile/v1/mtg/category-definitions?scope=${query.scope}&offset=${query.offset}&limit=${query.limit}`,
		{ headers: { accept: 'application/json' }, cache: 'no-store', signal: query.signal }
	);
	if (!current()) return null;
	if (!response.ok) throw new Error('Unavailable Library read');
	const page: CategoryLibraryPage = await response.json();
	return current() && page.offset === query.offset && page.limit === query.limit ? page : null;
}
