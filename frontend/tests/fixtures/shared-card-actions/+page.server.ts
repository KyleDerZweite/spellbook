import { readNativeAdditionDrafts } from '#lib/cards/addition-drafts.ts';
import { application } from '#lib/server/composition.ts';
import { addToDeck, addBrowsingToInventory } from '#lib/server/card-browsing-actions.ts';
import { fail, type Actions, type RequestEvent } from '@sveltejs/kit';
export const load = async ({ url, locals }: RequestEvent) => {
	const selectedPrinting = await application.catalog.getCatalogPrinting(
		url.searchParams.get('printing') ?? ''
	);
	const choiceQuery = url.searchParams.get('deckQuery') ?? '';
	const choiceOffset = Number(url.searchParams.get('deckOffset') ?? 0);
	const choices =
		locals.user && !url.searchParams.has('readFault')
			? await application.decks.getDeckChoices(locals.user, {
					query: choiceQuery,
					offset: choiceOffset,
					selectedDeckId: url.searchParams.get('selectedDeckId') || undefined
				})
			: null;
	return {
		selectedPrinting: url.searchParams.has('printingReadFault') ? null : selectedPrinting,
		printingReadError: url.searchParams.has('printingReadFault')
			? 'Fixture post-commit Printing read fault'
			: null,
		...readNativeAdditionDrafts(url.searchParams),
		choices,
		requestId: crypto.randomUUID(),
		choiceQuery,
		choiceOffset,
		choiceReadError: url.searchParams.has('readFault') ? 'Fixture post-commit read fault' : null,
		canonicalSearchHref: url.pathname + url.search,
		native: url.searchParams.has('native')
	};
};
export const actions: Actions = {
	addToDeck: async (event) => {
		const result = await addToDeck(event);
		if (event.request.headers.get('x-shared-test-loss') === 'true' && result && 'success' in result)
			return fail(503, {
				...result,
				success: false,
				uncertain: true,
				message: 'Fixture response lost after real commit'
			});
		return result;
	},
	addToInventory: addBrowsingToInventory
};
