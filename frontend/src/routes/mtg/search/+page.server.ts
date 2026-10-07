import { redirect, type Actions } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { addToDeck, addBrowsingToInventory } from '#lib/server/card-browsing-actions.ts';
import { nativeSearchContext } from './native.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { parseSearchUrl, searchHref } from '#lib/search/navigation.ts';
import { clampBrowsePagination } from '#lib/browsing/pagination.ts';
import { parseCatalogSearchRequest } from '#lib/server/catalog/query.ts';
import { getCatalogPrinting, searchCatalogRequest } from '#lib/server/catalog/search.ts';
import type { PageServerLoad } from './$types';
import type { CardDocument, SearchResult } from '#lib/search/types.ts';

export const load: PageServerLoad = async ({ url, request, locals }) => {
	const native = nativeSearchContext(url.searchParams);
	const nativeParseError = !!(
		native.printingReadError ||
		native.choiceReadError ||
		native.draftReadError
	);
	let searchInput = parseSearchUrl(url);
	let catalogResult: SearchResult | null = null;
	let catalogReadError: string | null = null;
	let clampedPage = false;
	try {
		const read = () =>
			searchCatalogRequest(
				parseCatalogSearchRequest({
					query: searchInput.query.trim().length < 2 ? '' : searchInput.query,
					filters: searchInput.filters,
					limit: searchInput.pagination!.limit,
					offset: searchInput.pagination!.offset,
					sort: searchInput.query.trim().length < 2 ? 'name:asc' : undefined,
					facets: true
				})
			);
		catalogResult = await read();
		const clamped = clampBrowsePagination(
			searchInput.pagination!,
			catalogResult.estimatedTotalHits
		);
		if (clamped.page !== searchInput.pagination!.page) {
			searchInput = { ...searchInput, pagination: clamped };
			clampedPage = true;
			// A native GET follows one canonical redirect. POST retains its committed action result.
			if (request.method !== 'GET' || nativeParseError) catalogResult = await read();
		}
	} catch {
		catalogReadError = 'Catalog search is unavailable. Retry this search.';
	}
	let selectedPrinting: CardDocument | null = null;
	let printingReadError = native.printingReadError;
	if (native.printingId) {
		try {
			selectedPrinting = await getCatalogPrinting(native.printingId);
		} catch (cause) {
			printingReadError =
				cause instanceof ValidationError
					? 'This printing is unavailable. Choose another card.'
					: 'Printing details are unavailable. Retry this selection.';
		}
	}
	let choices: Awaited<ReturnType<typeof application.decks.getDeckChoices>> | null = null;
	let choiceReadError = native.choiceReadError;
	if (locals.user && selectedPrinting && !choiceReadError) {
		try {
			choices = await application.decks.getDeckChoices(locals.user, {
				query: native.choiceQuery,
				offset: native.choiceOffset,
				limit: 20,
				selectedDeckId: native.selectedDeckId
			});
		} catch {
			choiceReadError = 'Deck choices are unavailable. Retry this selection.';
		}
	}
	const canonical = new URL(searchHref(searchInput), url);
	for (const [key, value] of native.context) canonical.searchParams.append(key, value);
	if (clampedPage && request.method === 'GET' && !catalogReadError && !nativeParseError)
		redirect(303, canonical.pathname + canonical.search);
	return {
		requestId: crypto.randomUUID(),
		searchInput,
		canonicalSearchHref: canonical.pathname + canonical.search,
		catalogResult,
		catalogReadError,
		selectedPrinting,
		printingReadError,
		choices,
		choiceReadError,
		choiceQuery: native.choiceQuery,
		choiceOffset: native.choiceOffset,
		deckDraft: native.deckDraft,
		inventoryDraft: native.inventoryDraft,
		draftReadError: native.draftReadError,
		nativeCardContext:
			!!native.printingId ||
			!!printingReadError ||
			!!native.deckDraft ||
			!!native.inventoryDraft ||
			!!native.choiceReadError ||
			!!native.draftReadError
	};
};

export const actions: Actions = {
	addToDeck,
	addToInventory: addBrowsingToInventory
};
