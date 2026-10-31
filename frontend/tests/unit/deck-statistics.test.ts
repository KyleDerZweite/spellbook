import { describe, expect, it } from 'vitest';
import type { DeckCard } from '@spellbook/contracts/decks.ts';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { storedCardDocument } from '#lib/mtg/stored-card.ts';
import { deckStatistics } from '#lib/decks/statistics.ts';

function entry(id: string, quantity: number, role = 'main'): DeckCard {
	return {
		id,
		quantity,
		role,
		deckId: 'deck',
		accountId: 'owner',
		game: 'mtg',
		catalogCardId: id,
		canonicalCardId: id,
		name: id,
		setCode: 'TST',
		imageUri: '',
		createdAt: '',
		updatedAt: ''
	};
}
function doc(
	card: DeckCard,
	cmc: number,
	colors: string[],
	types = ['Creature'],
	identity = colors
): CardDocument {
	return { ...storedCardDocument(card), cmc, colors, color_identity: identity, card_types: types };
}
describe('selected Deck statistics', () => {
	it('weights copies, includes Commander, and excludes sideboard and companion by default', () => {
		const cards = [
			entry('one', 4),
			entry('boss', 1, 'commander'),
			entry('side', 15, 'sideboard'),
			entry('pet', 1, 'companion')
		];
		const documents = Object.fromEntries(cards.map((c) => [c.id, doc(c, 3, ['G'])]));
		const result = deckStatistics(cards, documents);
		expect(result.quantity).toBe(5);
		expect(result.curve.find((c) => c.label === '3')?.quantity).toBe(5);
		expect(deckStatistics(cards, documents, 'sideboard').quantity).toBe(15);
		expect(deckStatistics(cards, documents, 'all').quantity).toBe(21);
	});
	it('excludes lands from the curve and average without dropping them from color shares', () => {
		const cards = [entry('forest', 20), entry('elf', 4), entry('boss', 1, 'commander')];
		const r = deckStatistics(cards, {
			forest: doc(cards[0], 0, [], ['Land'], ['G']),
			elf: doc(cards[1], 1, ['G']),
			boss: doc(cards[2], 4, ['G'])
		});
		expect(r.lands).toBe(20);
		expect(r.curveQuantity).toBe(5);
		expect(r.averageManaValue).toBe(1.6);
		expect(r.colors.find((c) => c.label === 'Colorless')?.quantity).toBe(20);
		expect(r.colorIdentity.find((c) => c.label === 'Green')?.quantity).toBe(25);
	});
	it('does not turn unavailable Catalog records or invalid costs into zero-mana cards', () => {
		const cards = [entry('unknown', 3), entry('bad', 2), entry('zero', 1)];
		const r = deckStatistics(cards, {
			bad: doc(cards[1], Number.NaN, ['U']),
			zero: doc(cards[2], 0, [])
		});
		expect(r.unknown).toBe(3);
		expect(r.curveUnknown).toBe(5);
		expect(r.curve.find((c) => c.label === '0')?.quantity).toBe(1);
		expect(r.averageManaValue).toBe(0);
	});
	it('uses exclusive multicolor categories and retains real fractional mana values and 8+ costs', () => {
		const cards = [entry('gold', 2), entry('half', 1), entry('huge', 3)];
		const r = deckStatistics(cards, {
			gold: doc(cards[0], 2, ['R', 'G']),
			half: doc(cards[1], 0.5, ['R']),
			huge: doc(cards[2], 12, [])
		});
		expect(r.colors.find((c) => c.label === 'Multicolor')?.quantity).toBe(2);
		expect(r.colors.reduce((n, c) => n + c.quantity, 0)).toBe(6);
		expect(r.curve.find((c) => c.label === '0.5')?.quantity).toBe(1);
		expect(r.curve.find((c) => c.label === '8+')?.quantity).toBe(3);
		expect(r.averageManaValue).toBeCloseTo(40.5 / 6);
	});
	it('has honest empty and entirely unavailable states', () => {
		const empty = deckStatistics([], {});
		expect(empty.quantity).toBe(0);
		expect(empty.averageManaValue).toBeNull();
		const r = deckStatistics([entry('missing', 8)], {});
		expect(r.curveQuantity).toBe(0);
		expect(r.averageManaValue).toBeNull();
		expect(r.unknown).toBe(8);
	});
	it('uses the front face for land exclusion when the Catalog contains types from both faces', () => {
		const card = entry('recovery', 2);
		const document = {
			...doc(card, 3, [], ['Sorcery', 'Land'], ['G']),
			layout: 'modal_dfc',
			type_line: 'Sorcery // Land',
			mana_cost: ''
		};
		const r = deckStatistics([card], { recovery: document });
		expect(r.lands).toBe(0);
		expect(r.curveQuantity).toBe(2);
		expect(r.averageManaValue).toBe(3);
	});
	it('keeps unprojected double-face colors unknown while preserving resolved color identity', () => {
		const card = entry('transform', 1);
		const document = {
			...doc(card, 5, [], ['Creature', 'Enchantment'], ['R']),
			layout: 'transform',
			type_line: 'Creature // Enchantment',
			mana_cost: ''
		};
		const r = deckStatistics([card], { transform: document });
		expect(r.colors.find((c) => c.label === 'Unknown')?.quantity).toBe(1);
		expect(r.colors.find((c) => c.label === 'Colorless')?.quantity).toBe(0);
		expect(r.colorIdentity.find((c) => c.label === 'Red')?.quantity).toBe(1);
	});
	it('does not turn missing reversible-face characteristics into a zero-value colorless card', () => {
		const card = entry('reversible', 1);
		const document = { ...doc(card, 0, [], []), layout: 'reversible_card' };
		const r = deckStatistics([card], { reversible: document });
		expect(r.curveQuantity).toBe(0);
		expect(r.curveUnknown).toBe(1);
		expect(r.averageManaValue).toBeNull();
		expect(r.colorIdentity.find((c) => c.label === 'Unknown')?.quantity).toBe(1);
	});
});
