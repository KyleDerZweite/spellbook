import { fail, redirect, type Actions } from '@sveltejs/kit';
import { addToInventory } from '#lib/server/data/inventory.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import { parseSearchUrl, searchHref } from '#lib/search/navigation.ts';
import { clampBrowsePagination } from '#lib/browsing/pagination.ts';
import { parseCatalogSearchRequest } from '#lib/server/catalog/query.ts';
import { getCatalogPrinting, searchCatalogRequest } from '#lib/server/catalog/search.ts';
import type { PageServerLoad } from './$types';
import type { CardDocument, SearchResult } from '#lib/search/types.ts';

export const load: PageServerLoad = async ({ url }) => {
	let searchInput = parseSearchUrl(url);
	let catalogResult: SearchResult | null = null;
	let catalogReadError: string | null = null;
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
			catalogResult = await read();
		}
	} catch {
		catalogReadError = 'Catalog search is unavailable. Retry this search.';
	}
	let selectedPrinting: CardDocument | null = null;
	let printingReadError: string | null = null;
	const selections = url.searchParams.getAll('printing');
	if (selections.length) {
		if (
			selections.length !== 1 ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selections[0])
		) {
			printingReadError = 'Invalid printing selection. Choose a card from the results.';
		} else {
			try {
				selectedPrinting = await getCatalogPrinting(selections[0]);
			} catch (cause) {
				printingReadError =
					cause instanceof ValidationError
						? 'This printing is unavailable. Choose another card.'
						: 'Printing details are unavailable. Retry this selection.';
			}
		}
	}
	const canonical = new URL(searchHref(searchInput), url);
	if (selectedPrinting) canonical.searchParams.set('printing', selectedPrinting.id);
	return {
		requestId: crypto.randomUUID(),
		searchInput,
		canonicalSearchHref: canonical.pathname + canonical.search,
		catalogResult,
		catalogReadError,
		selectedPrinting,
		printingReadError
	};
};

export const actions: Actions = {
	addToInventory: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/search');
		const form = await request.formData();
		if (!form.get('catalogCardId') || !form.get('requestId'))
			return fail(400, { message: 'catalogCardId and requestId are required' });
		try {
			const acknowledgement = await addToInventory(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				catalogCardId: String(form.get('catalogCardId') ?? ''),
				finish: String(form.get('finish') ?? 'nonfoil'),
				condition: String(form.get('condition') ?? 'NM'),
				quantity: Number(form.get('quantity') ?? 1),
				source: 'web'
			});
			return { success: true, acknowledgement };
		} catch (cause) {
			if (cause instanceof RequestConflictError) return fail(409, { message: cause.message });
			if (cause instanceof ValidationError) return fail(400, { message: cause.message });
			throw cause;
		}
	}
};
