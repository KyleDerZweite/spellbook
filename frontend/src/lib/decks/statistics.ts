import type { DeckCard } from '@spellbook/contracts/decks.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
export type DeckStatisticsScope = 'deck' | 'main' | 'sideboard' | 'companion' | 'all';
export type DeckDistribution = { label: string; quantity: number };
const labels: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const colorLabels = [...Object.values(labels), 'Multicolor', 'Colorless', 'Unknown'];
function colorLabel(colors: string[]) {
	const unique = [...new Set(colors)];
	if (unique.some((c) => !labels[c])) return 'Unknown';
	return unique.length > 1 ? 'Multicolor' : unique.length ? labels[unique[0]] : 'Colorless';
}
/** Derived only from the selected composition and its resolved Catalog records. */
export function deckStatistics(
	cards: DeckCard[],
	documents: Record<string, CardDocument>,
	scope: DeckStatisticsScope = 'deck'
) {
	const included = cards.filter(
		(c) =>
			scope === 'all' ||
			(scope === 'deck' ? c.role === 'main' || c.role === 'commander' : c.role === scope)
	);
	const colors = new Map(colorLabels.map((label) => [label, 0]));
	const identity = new Map(colors);
	const curve = new Map<string, number>(Array.from({ length: 8 }, (_, n) => [String(n), 0]));
	curve.set('8+', 0);
	let quantity = 0,
		unknown = 0,
		lands = 0,
		curveUnknown = 0,
		curveQuantity = 0,
		manaValue = 0;
	for (const card of included) {
		quantity += card.quantity;
		const document = documents[card.catalogCardId];
		const add = (map: Map<string, number>, label: string) =>
			map.set(label, (map.get(label) ?? 0) + card.quantity);
		// Reversible cards have independent faces which the flat DTO does not describe.
		if (!document || document.layout === 'reversible_card') {
			unknown += card.quantity;
			curveUnknown += card.quantity;
			add(colors, 'Unknown');
			add(identity, 'Unknown');
			continue;
		}
		add(colors, colorLabel(document.colors));
		add(identity, colorLabel(document.color_identity));
		// Catalog card_types combines both faces; deck analysis uses the front type line.
		const frontTypes = document.type_line
			.split(' // ')[0]
			.split('\u2014')[0]
			.split(' - ')[0]
			.split(/\s+/);
		const land = document.type_line
			? frontTypes.includes('Land')
			: document.card_types.includes('Land');
		if (land) {
			lands += card.quantity;
			continue;
		}
		if (!Number.isFinite(document.cmc) || document.cmc < 0) {
			curveUnknown += card.quantity;
			continue;
		}
		const bucket = document.cmc >= 8 ? '8+' : String(document.cmc);
		add(curve, bucket);
		curveQuantity += card.quantity;
		manaValue += document.cmc * card.quantity;
	}
	const distribution = (map: Map<string, number>): DeckDistribution[] =>
		[...map].map(([label, quantity]) => ({ label, quantity }));
	return {
		quantity,
		unknown,
		lands,
		curveUnknown,
		curveQuantity,
		averageManaValue: curveQuantity ? manaValue / curveQuantity : null,
		colors: distribution(colors),
		colorIdentity: distribution(identity),
		curve: distribution(curve).sort((a, b) =>
			a.label === '8+' ? 1 : b.label === '8+' ? -1 : Number(a.label) - Number(b.label)
		)
	};
}
