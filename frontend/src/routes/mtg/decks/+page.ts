import { error } from '@sveltejs/kit';
import { demoDeckLibrary, type DemoDecks } from '#lib/demo/decks.ts';
import { readDemoInventory } from '#lib/demo/inventory.ts';
import { readDemo } from '#lib/demo/storage.ts';
import { translate } from '#lib/i18n/messages.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, parent, depends }) => {
	const { demoSession, locale } = await parent();
	if (!demoSession || typeof window === 'undefined') {
		return {
			...data,
			demoDeckChanged: false,
			demoAnalysisUnavailable: false,
			demoOwnedPrintings: null
		};
	}
	depends('demo:decks');
	depends('demo:inventory');
	const [storedDecks, inventory] = await Promise.all([
		readDemo<DemoDecks>(demoSession, 'decks'),
		readDemoInventory(demoSession)
	]);
	const changes = storedDecks ?? {};
	const demoAnalysisUnavailable = Object.keys(changes).length > 0 || !!inventory;
	const demoOwnedPrintings =
		inventory?.entries.map(({ catalogCardId, canonicalCardId, quantity }) => ({
			catalogCardId,
			canonicalCardId,
			quantity
		})) ?? null;
	const id = data.selectedDeckId;
	const local = id ? changes[id] : undefined;
	if (id && (local === null || (!local && !data.decks.length))) {
		error(404, translate(locale, 'notice.Deck.not.found'));
	}
	return {
		...data,
		demoDeckChanged: !!local,
		demoAnalysisUnavailable,
		demoOwnedPrintings,
		...(demoAnalysisUnavailable && {
			availability: {},
			valueEstimates: null,
			valuationError: null
		}),
		deckLibrary:
			demoAnalysisUnavailable && data.tab === 'library'
				? await demoDeckLibrary(
						demoSession,
						data.deckLibrary.query,
						data.deckLibrary.offset,
						data.deckLibrary.limit
					)
				: data.deckLibrary,
		...(local && {
			decks: [local.deck],
			deckCards: local.cards,
			deckDocuments: { ...data.deckDocuments, ...local.documents },
			relatedTokens: local.tokens,
			warnings: [],
			legalityError: translate(locale, 'ui.Format.checks.unavailable'),
			deckTotals: { [local.deck.id]: local.cards.reduce((sum, card) => sum + card.quantity, 0) }
		})
	};
};
