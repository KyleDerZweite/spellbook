import { describe, expect, it } from 'vitest';
import type { DeckCard } from '@spellbook/contracts/decks.ts';
import { storedCardDocument } from '#lib/mtg/stored-card.ts';
import { deckSections } from '#lib/decks/sections.ts';

const entry = (id: string, role = 'main', quantity = 1): DeckCard => ({
	id,
	role,
	quantity,
	deckId: 'deck',
	accountId: 'account',
	game: 'mtg',
	catalogCardId: id,
	canonicalCardId: id,
	name: id,
	setCode: 'TST',
	imageUri: '',
	createdAt: '',
	updatedAt: ''
});
describe('Deck role sections', () => {
	it('keeps role order and real totals when the visible cards are filtered', () => {
		const entries = [
			entry('side', 'sideboard', 15),
			entry('main', 'main', 4),
			entry('boss', 'commander'),
			entry('pet', 'companion')
		];
		const sections = deckSections(
			entries,
			entries.filter((card) => card.id !== 'main'),
			{}
		);
		expect(sections.map((section) => [section.value, section.count])).toEqual([
			['commander', 1],
			['main', 4],
			['sideboard', 15],
			['companion', 1]
		]);
		expect(sections[1].groups).toEqual([]);
		expect(sections[2].groups[0][1].map((card) => card.id)).toEqual(['side']);
	});
	it.each([
		['Bala Ged Recovery', 'Sorcery // Land', ['Sorcery', 'Land'], 'Sorcery'],
		['Treasure Map', 'Artifact // Land', ['Artifact', 'Land'], 'Artifact'],
		["Conqueror's Galleon", 'Artifact — Vehicle // Land', ['Artifact', 'Land'], 'Artifact']
	])('groups %s by the front face', (name, typeLine, types, expected) => {
		const card = entry(String(name));
		const document = {
			...storedCardDocument(card),
			type_line: String(typeLine),
			card_types: types as string[]
		};
		const main = deckSections([card], [card], { [card.id]: document })[1];
		expect(main.groups.map(([label]) => label)).toEqual([expected]);
	});
	it('uses the existing primary type priority for multitype main cards', () => {
		const cards = [entry('artifact-creature'), entry('land-creature'), entry('unknown')];
		const document = (card: DeckCard, card_types: string[]) => ({
			...storedCardDocument(card),
			card_types
		});
		const sections = deckSections(cards, cards, {
			'artifact-creature': document(cards[0], ['Artifact', 'Creature']),
			'land-creature': document(cards[1], ['Creature', 'Land'])
		});
		expect(
			sections[1].groups.map(([label, cards]) => [label, cards.map((card) => card.id)])
		).toEqual([
			['Creature', ['artifact-creature']],
			['Land', ['land-creature']],
			['Other', ['unknown']]
		]);
	});
});
