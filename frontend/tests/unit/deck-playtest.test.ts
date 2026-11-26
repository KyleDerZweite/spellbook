import { describe, expect, it } from 'vitest';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { DeckCard } from '@spellbook/contracts/decks.ts';
import { storedCardDocument } from '#lib/mtg/stored-card.ts';
import {
	createPlaytestState,
	expandPlaytestDeck,
	handSummary,
	PLAYTEST_PHASES,
	playtestReducer,
	shuffleCards,
	startingLifeForFormat
} from '#lib/decks/playtest.ts';

function deckCard(id: string, quantity: number, role = 'main'): DeckCard {
	return {
		id,
		quantity,
		role,
		deckId: 'deck-1',
		accountId: 'owner-1',
		game: 'mtg',
		catalogCardId: id,
		canonicalCardId: id,
		name: id,
		setCode: 'TST',
		imageUri: `https://example.invalid/${id}.jpg`,
		createdAt: '',
		updatedAt: ''
	};
}

function cardDoc(
	card: DeckCard,
	cmc: number,
	colors: string[],
	typeLine = 'Creature',
	cardTypes = ['Creature']
): CardDocument {
	return {
		...storedCardDocument(card),
		cmc,
		colors,
		color_identity: colors,
		type_line: typeLine,
		card_types: cardTypes
	};
}

function seededRng(seed = 42): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

describe('goldfish playtester state and reducer', () => {
	it('sets starting life to 40 for Commander/Brawl and 20 otherwise', () => {
		expect(startingLifeForFormat('Commander')).toBe(40);
		expect(startingLifeForFormat('Brawl')).toBe(40);
		expect(startingLifeForFormat('Standard')).toBe(20);
		expect(startingLifeForFormat('Modern')).toBe(20);
		expect(startingLifeForFormat('Casual')).toBe(20);
	});

	it('expands main cards to library, commanders to command zone, and ignores sideboard/companion', () => {
		const cards = [
			deckCard('forest', 4, 'main'),
			deckCard('elf', 2, 'main'),
			deckCard('boss', 1, 'commander'),
			deckCard('side', 3, 'sideboard'),
			deckCard('pet', 1, 'companion')
		];
		const docs = {
			forest: cardDoc(cards[0], 0, [], 'Basic Land — Forest', ['Land']),
			elf: cardDoc(cards[1], 1, ['G'], 'Creature — Elf', ['Creature']),
			boss: cardDoc(cards[2], 4, ['G'], 'Legendary Creature', ['Creature'])
		};
		const { library, command } = expandPlaytestDeck(cards, docs);
		expect(library).toHaveLength(6);
		expect(command).toHaveLength(1);
		expect(new Set(library.map((c) => c.instanceId)).size).toBe(6);
		expect(library.filter((c) => c.isLand)).toHaveLength(4);
		expect(command[0].name).toBe('boss');
	});

	it('detects MDFC front-face non-lands correctly', () => {
		const mdfc = deckCard('recovery', 2, 'main');
		const docs = {
			recovery: {
				...cardDoc(mdfc, 3, ['G'], 'Sorcery // Land', ['Sorcery', 'Land']),
				layout: 'modal_dfc'
			}
		};
		const { library } = expandPlaytestDeck([mdfc], docs);
		expect(library.every((c) => !c.isLand)).toBe(true);
		expect(library[0].cmc).toBe(3);
	});

	it('draws an opening hand of 7 and leaves remaining cards in library', () => {
		const cards = [deckCard('forest', 6, 'main'), deckCard('elf', 4, 'main')];
		const docs = {
			forest: cardDoc(cards[0], 0, [], 'Basic Land — Forest', ['Land']),
			elf: cardDoc(cards[1], 1, ['G'])
		};
		const state = createPlaytestState({ cards, documents: docs, format: 'Modern' }, seededRng(1));
		expect(state.zones.hand).toHaveLength(7);
		expect(state.zones.library).toHaveLength(3);
		expect(state.turn).toBe(1);
		expect(state.phase).toBe('untap');
		expect(state.life).toBe(20);
		expect(state.mulliganCount).toBe(0);
		expect(state.pendingMulliganBottom).toBe(0);
	});

	it('handles decks smaller than 7 cards without crashing', () => {
		const cards = [deckCard('elf', 3, 'main')];
		const state = createPlaytestState({ cards, documents: {}, format: 'Casual' }, seededRng(2));
		expect(state.zones.hand).toHaveLength(3);
		expect(state.zones.library).toHaveLength(0);
	});

	it('shuffles preserving all cards and draws from top of library', () => {
		const items = [1, 2, 3, 4, 5, 6, 7, 8];
		const shuffled = shuffleCards(items, seededRng(99));
		expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
		expect(shuffled).not.toEqual(items);

		const cards = [deckCard('c', 10, 'main')];
		let state = createPlaytestState({ cards, documents: {}, format: 'Standard' }, seededRng(5));
		const topCardId = state.zones.library[0].instanceId;
		state = playtestReducer(state, { type: 'draw' });
		expect(state.zones.hand).toHaveLength(8);
		expect(state.zones.hand[7].instanceId).toBe(topCardId);
		expect(state.zones.library).toHaveLength(2);

		// Drawing more than available clamps cleanly.
		state = playtestReducer(state, { type: 'draw', count: 5 });
		expect(state.zones.hand).toHaveLength(10);
		expect(state.zones.library).toHaveLength(0);
	});

	it('supports London Mulligan: redraw 7 and put N cards on bottom of library', () => {
		const cards = [deckCard('card', 12, 'main')];
		const input = { cards, documents: {}, format: 'Commander' };
		let state = createPlaytestState(input, seededRng(7));

		// First mulligan: redraw 7, must put 1 on bottom.
		state = playtestReducer(state, { type: 'mulligan' }, input, seededRng(8));
		expect(state.zones.hand).toHaveLength(7);
		expect(state.zones.library).toHaveLength(5);
		expect(state.mulliganCount).toBe(1);
		expect(state.pendingMulliganBottom).toBe(1);

		const chosenId = state.zones.hand[0].instanceId;
		state = playtestReducer(state, { type: 'mulliganBottom', instanceId: chosenId });
		expect(state.zones.hand).toHaveLength(6);
		expect(state.zones.library).toHaveLength(6);
		expect(state.zones.library[state.zones.library.length - 1].instanceId).toBe(chosenId);
		expect(state.pendingMulliganBottom).toBe(0);

		// Second mulligan: redraw 7, pending = 2; moving via moveCard to library bottom also decrements pending.
		state = playtestReducer(state, { type: 'mulligan' }, input, seededRng(9));
		expect(state.mulliganCount).toBe(2);
		expect(state.pendingMulliganBottom).toBe(2);
		const movedId = state.zones.hand[0].instanceId;
		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: movedId,
			from: 'hand',
			to: 'library',
			position: 'bottom'
		});
		expect(state.pendingMulliganBottom).toBe(1);
		expect(state.zones.library[state.zones.library.length - 1].instanceId).toBe(movedId);
		const secondMovedId = state.zones.hand[0].instanceId;
		state = playtestReducer(state, { type: 'mulliganBottom', instanceId: secondMovedId });
		expect(state.pendingMulliganBottom).toBe(0);
		expect(state.zones.hand).toHaveLength(5);

		// Moving all remaining cards out of hand during a pending mulligan clamps pendingMulliganBottom to 0.
		state = playtestReducer(state, { type: 'mulligan' }, input, seededRng(14));
		expect(state.pendingMulliganBottom).toBe(3);
		for (const card of [...state.zones.hand]) {
			state = playtestReducer(state, {
				type: 'moveCard',
				instanceId: card.instanceId,
				from: 'hand',
				to: 'battlefield'
			});
		}
		expect(state.zones.hand).toHaveLength(0);
		expect(state.pendingMulliganBottom).toBe(0);
	});

	it('moves cards freely across all 6 zones and resets battlefield state on exit', () => {
		const cards = [deckCard('bolt', 8, 'main'), deckCard('boss', 1, 'commander')];
		let state = createPlaytestState({ cards, documents: {}, format: 'Commander' }, seededRng(10));
		const handCard = state.zones.hand[0];

		// Hand -> Battlefield -> tap + add counters
		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'hand',
			to: 'battlefield'
		});
		state = playtestReducer(state, { type: 'toggleTap', instanceId: handCard.instanceId });
		state = playtestReducer(state, {
			type: 'adjustCardCounter',
			instanceId: handCard.instanceId,
			delta: 2
		});
		expect(state.zones.battlefield[0].tapped).toBe(true);
		expect(state.zones.battlefield[0].counters).toBe(2);

		// Battlefield -> Graveyard resets tapped & counters
		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'battlefield',
			to: 'graveyard'
		});
		expect(state.zones.graveyard[0].tapped).toBe(false);
		expect(state.zones.graveyard[0].counters).toBe(0);

		// Graveyard -> Exile -> Command -> Library top -> Library bottom
		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'graveyard',
			to: 'exile'
		});
		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'exile',
			to: 'command'
		});
		expect(state.zones.command.some((c) => c.instanceId === handCard.instanceId)).toBe(true);

		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'command',
			to: 'library',
			position: 'top'
		});
		expect(state.zones.library[0].instanceId).toBe(handCard.instanceId);

		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: handCard.instanceId,
			from: 'library',
			to: 'library',
			position: 'bottom'
		});
		expect(state.zones.library[state.zones.library.length - 1].instanceId).toBe(
			handCard.instanceId
		);
	});

	it('steps phases manually without auto-untap or auto-draw on next turn', () => {
		const cards = [deckCard('elf', 10, 'main')];
		let state = createPlaytestState({ cards, documents: {}, format: 'Modern' }, seededRng(11));
		const playedId = state.zones.hand[0].instanceId;

		state = playtestReducer(state, {
			type: 'moveCard',
			instanceId: playedId,
			from: 'hand',
			to: 'battlefield'
		});
		state = playtestReducer(state, { type: 'toggleTap', instanceId: playedId });
		const handBefore = state.zones.hand.length;

		// Step through all 7 phases manually.
		for (let i = 1; i < PLAYTEST_PHASES.length; i++) {
			state = playtestReducer(state, { type: 'stepPhase', direction: 'next' });
			expect(state.phase).toBe(PLAYTEST_PHASES[i]);
			expect(state.turn).toBe(1);
		}
		// Stepping past End advances to Turn 2 Untap without auto-untap or auto-draw.
		state = playtestReducer(state, { type: 'stepPhase', direction: 'next' });
		expect(state.turn).toBe(2);
		expect(state.phase).toBe('untap');
		expect(state.zones.battlefield[0].tapped).toBe(true);
		expect(state.zones.hand.length).toBe(handBefore);

		// Explicit untapAll untaps all battlefield permanents.
		state = playtestReducer(state, { type: 'untapAll' });
		expect(state.zones.battlefield[0].tapped).toBe(false);

		// Stepping prev from Turn 2 Untap goes to Turn 1 End; prev from Turn 1 Untap stays at Turn 1 Untap.
		state = playtestReducer(state, { type: 'stepPhase', direction: 'prev' });
		expect(state.turn).toBe(1);
		expect(state.phase).toBe('end');
		state = playtestReducer(state, { type: 'setPhase', phase: 'untap' });
		state = playtestReducer(state, { type: 'stepPhase', direction: 'prev' });
		expect(state.turn).toBe(1);
		expect(state.phase).toBe('untap');

		// Explicit nextTurn increments turn and resets phase to untap.
		state = playtestReducer(state, { type: 'setPhase', phase: 'combat' });
		state = playtestReducer(state, { type: 'nextTurn' });
		expect(state.turn).toBe(2);
		expect(state.phase).toBe('untap');
	});

	it('tracks life, player counters, and full game reset', () => {
		const cards = [deckCard('elf', 10, 'main')];
		const input = { cards, documents: {}, format: 'Modern' };
		let state = createPlaytestState(input, seededRng(12));

		state = playtestReducer(state, { type: 'adjustLife', delta: -3 });
		expect(state.life).toBe(17);
		state = playtestReducer(state, { type: 'adjustPlayerCounter', counter: 'poison', delta: 2 });
		state = playtestReducer(state, { type: 'adjustPlayerCounter', counter: 'poison', delta: -5 });
		expect(state.counters.poison).toBe(0);
		state = playtestReducer(state, { type: 'adjustPlayerCounter', counter: 'storm', delta: 4 });
		expect(state.counters.storm).toBe(4);

		state = playtestReducer(state, { type: 'reset' }, input, seededRng(13));
		expect(state.life).toBe(20);
		expect(state.counters).toEqual({ poison: 0, storm: 0, energy: 0 });
		expect(state.turn).toBe(1);
		expect(state.phase).toBe('untap');
		expect(state.zones.hand).toHaveLength(7);
		expect(state.zones.library).toHaveLength(3);
	});

	it('summarizes hand lands, non-lands, average mana value, turn playability, and colors', () => {
		const cards = [
			deckCard('forest', 2, 'main'),
			deckCard('elf', 1, 'main'),
			deckCard('bear', 1, 'main'),
			deckCard('gold', 1, 'main'),
			deckCard('wurm', 1, 'main')
		];
		const docs = {
			forest: cardDoc(cards[0], 0, [], 'Basic Land — Forest', ['Land']),
			elf: cardDoc(cards[1], 1, ['G']),
			bear: cardDoc(cards[2], 2, ['G']),
			gold: cardDoc(cards[3], 3, ['R', 'G']),
			wurm: cardDoc(cards[4], 6, ['G'])
		};
		const { library } = expandPlaytestDeck(cards, docs);
		const summary = handSummary(library);
		expect(summary.total).toBe(6);
		expect(summary.lands).toBe(2);
		expect(summary.nonlands).toBe(4);
		expect(summary.averageManaValue).toBe(3);
		expect(summary.manaValueThresholds).toEqual({ le1: 1, le2: 2, le3: 3 });
		expect(summary.colors).toEqual([
			{ label: 'Green', count: 3 },
			{ label: 'Multicolor', count: 1 },
			{ label: 'Colorless', count: 2 }
		]);
	});
});
