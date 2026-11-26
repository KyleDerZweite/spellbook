import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import type { DeckCard } from '@spellbook/contracts/decks.ts';

export type PlaytestZone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command';

export type PlaytestPhase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';

export const PLAYTEST_PHASES: readonly PlaytestPhase[] = [
	'untap',
	'upkeep',
	'draw',
	'main1',
	'combat',
	'main2',
	'end'
];

export const PLAYTEST_ZONES: readonly PlaytestZone[] = [
	'library',
	'hand',
	'battlefield',
	'graveyard',
	'exile',
	'command'
];

export const OPENING_HAND_SIZE = 7;

export interface PlaytestCard {
	instanceId: string;
	entryId: string;
	catalogCardId: string;
	name: string;
	imageUri: string;
	role: string;
	isLand: boolean;
	cmc: number | null;
	manaCost: string;
	typeLine: string;
	colors: string[];
	tapped: boolean;
	counters: number;
}

export interface PlaytestCounters {
	poison: number;
	storm: number;
	energy: number;
}

export interface PlaytestState {
	zones: Record<PlaytestZone, PlaytestCard[]>;
	turn: number;
	phase: PlaytestPhase;
	life: number;
	startingLife: number;
	counters: PlaytestCounters;
	mulliganCount: number;
	pendingMulliganBottom: number;
}

export interface PlaytestDeckInput {
	cards: readonly DeckCard[];
	documents: Record<string, CardDocument>;
	format: string;
}

export type PlaytestAction =
	| { type: 'reset' }
	| { type: 'shuffle' }
	| { type: 'draw'; count?: number }
	| { type: 'mulligan' }
	| { type: 'mulliganBottom'; instanceId: string }
	| {
			type: 'moveCard';
			instanceId: string;
			from: PlaytestZone;
			to: PlaytestZone;
			position?: 'top' | 'bottom';
	  }
	| { type: 'toggleTap'; instanceId: string }
	| { type: 'untapAll' }
	| { type: 'adjustCardCounter'; instanceId: string; delta: number }
	| { type: 'setPhase'; phase: PlaytestPhase }
	| { type: 'stepPhase'; direction: 'next' | 'prev' }
	| { type: 'nextTurn' }
	| { type: 'adjustTurn'; delta: number }
	| { type: 'adjustLife'; delta: number }
	| { type: 'adjustPlayerCounter'; counter: keyof PlaytestCounters; delta: number };

export interface HandColorCount {
	label: string;
	count: number;
}

export interface HandSummary {
	total: number;
	lands: number;
	nonlands: number;
	averageManaValue: number | null;
	manaValueThresholds: {
		le1: number;
		le2: number;
		le3: number;
	};
	colors: HandColorCount[];
}

const COLOR_LABELS: Record<string, string> = {
	W: 'White',
	U: 'Blue',
	B: 'Black',
	R: 'Red',
	G: 'Green'
};

/** Front-face land check matching deck statistics. */
export function isLandDocument(document?: CardDocument): boolean {
	if (!document || document.layout === 'reversible_card') return false;
	if (document.type_line) {
		const frontTypes = document.type_line
			.split(' // ')[0]
			.split('\u2014')[0]
			.split(' - ')[0]
			.split(/\s+/);
		return frontTypes.includes('Land');
	}
	return document.card_types.includes('Land');
}

export function startingLifeForFormat(format: string): number {
	const normalized = format.trim().toLowerCase();
	if (normalized.includes('commander') || normalized.includes('brawl')) return 40;
	return 20;
}

export function shuffleCards<T>(cards: readonly T[], rng: () => number = Math.random): T[] {
	const copy = [...cards];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

/** Expands Deck entries into individual card instances: Main -> Library, Commander -> Command Zone. */
export function expandPlaytestDeck(
	cards: readonly DeckCard[],
	documents: Record<string, CardDocument>
): { library: PlaytestCard[]; command: PlaytestCard[] } {
	const library: PlaytestCard[] = [];
	const command: PlaytestCard[] = [];

	for (const entry of cards) {
		if (entry.role !== 'main' && entry.role !== 'commander') continue;
		const document = documents[entry.catalogCardId];
		const reversible = document?.layout === 'reversible_card';
		const isLand = isLandDocument(document);
		const cmc =
			document && !reversible && Number.isFinite(document.cmc) && document.cmc >= 0
				? document.cmc
				: null;
		const colors = document && !reversible ? [...document.colors] : [];
		const target = entry.role === 'commander' ? command : library;

		for (let copy = 0; copy < entry.quantity; copy++) {
			target.push({
				instanceId: `${entry.id}:${copy}`,
				entryId: entry.id,
				catalogCardId: entry.catalogCardId,
				name: entry.name,
				imageUri: entry.imageUri || document?.image_uri || '',
				role: entry.role,
				isLand,
				cmc,
				manaCost: document?.mana_cost ?? '',
				typeLine: document?.type_line ?? '',
				colors,
				tapped: false,
				counters: 0
			});
		}
	}

	return { library, command };
}

export function createPlaytestState(
	input: PlaytestDeckInput,
	rng: () => number = Math.random
): PlaytestState {
	const { library, command } = expandPlaytestDeck(input.cards, input.documents);
	const shuffled = shuffleCards(library, rng);
	const drawCount = Math.min(OPENING_HAND_SIZE, shuffled.length);
	const hand = shuffled.slice(0, drawCount);
	const remainingLibrary = shuffled.slice(drawCount);
	const startingLife = startingLifeForFormat(input.format);

	return {
		zones: {
			library: remainingLibrary,
			hand,
			battlefield: [],
			graveyard: [],
			exile: [],
			command
		},
		turn: 1,
		phase: 'untap',
		life: startingLife,
		startingLife,
		counters: { poison: 0, storm: 0, energy: 0 },
		mulliganCount: 0,
		pendingMulliganBottom: 0
	};
}

export function playtestReducer(
	state: PlaytestState,
	action: PlaytestAction,
	deckInput?: PlaytestDeckInput,
	rng: () => number = Math.random
): PlaytestState {
	switch (action.type) {
		case 'reset': {
			if (!deckInput) return state;
			return createPlaytestState(deckInput, rng);
		}
		case 'shuffle': {
			return {
				...state,
				zones: {
					...state.zones,
					library: shuffleCards(state.zones.library, rng)
				}
			};
		}
		case 'draw': {
			const requested = action.count ?? 1;
			if (requested <= 0 || state.zones.library.length === 0) return state;
			const actual = Math.min(requested, state.zones.library.length);
			const drawn = state.zones.library.slice(0, actual);
			const remaining = state.zones.library.slice(actual);
			return {
				...state,
				zones: {
					...state.zones,
					library: remaining,
					hand: [...state.zones.hand, ...drawn]
				}
			};
		}
		case 'mulligan': {
			const combined = [...state.zones.library, ...state.zones.hand].map((card) => ({
				...card,
				tapped: false,
				counters: 0
			}));
			const shuffled = shuffleCards(combined, rng);
			const drawCount = Math.min(OPENING_HAND_SIZE, shuffled.length);
			const nextHand = shuffled.slice(0, drawCount);
			const nextLibrary = shuffled.slice(drawCount);
			const nextMulliganCount = state.mulliganCount + 1;
			return {
				...state,
				zones: {
					...state.zones,
					library: nextLibrary,
					hand: nextHand
				},
				mulliganCount: nextMulliganCount,
				pendingMulliganBottom: Math.min(nextMulliganCount, nextHand.length)
			};
		}
		case 'mulliganBottom': {
			const cardIndex = state.zones.hand.findIndex((c) => c.instanceId === action.instanceId);
			if (cardIndex === -1) return state;
			const card = state.zones.hand[cardIndex];
			const nextHand = [
				...state.zones.hand.slice(0, cardIndex),
				...state.zones.hand.slice(cardIndex + 1)
			];
			return {
				...state,
				zones: {
					...state.zones,
					hand: nextHand,
					library: [...state.zones.library, { ...card, tapped: false, counters: 0 }]
				},
				pendingMulliganBottom: Math.max(0, state.pendingMulliganBottom - 1)
			};
		}
		case 'moveCard': {
			const sourceList = state.zones[action.from];
			const cardIndex = sourceList.findIndex((c) => c.instanceId === action.instanceId);
			if (cardIndex === -1) return state;
			const original = sourceList[cardIndex];
			const nextSource = [...sourceList.slice(0, cardIndex), ...sourceList.slice(cardIndex + 1)];
			const movedCard: PlaytestCard =
				action.to === 'battlefield' ? original : { ...original, tapped: false, counters: 0 };

			if (action.from === action.to) {
				if (action.to !== 'library') return state;
				const reordered =
					action.position === 'top' ? [movedCard, ...nextSource] : [...nextSource, movedCard];
				return {
					...state,
					zones: {
						...state.zones,
						library: reordered
					}
				};
			}

			const targetList = state.zones[action.to];
			const nextTarget =
				action.to === 'library' && action.position === 'top'
					? [movedCard, ...targetList]
					: [...targetList, movedCard];
			const satisfiesMulliganBottom =
				action.from === 'hand' &&
				action.to === 'library' &&
				action.position === 'bottom' &&
				state.pendingMulliganBottom > 0;

			const nextPending = satisfiesMulliganBottom
				? Math.max(0, state.pendingMulliganBottom - 1)
				: state.pendingMulliganBottom;
			const nextHandLength =
				action.from === 'hand'
					? nextSource.length
					: action.to === 'hand'
						? nextTarget.length
						: state.zones.hand.length;

			return {
				...state,
				zones: {
					...state.zones,
					[action.from]: nextSource,
					[action.to]: nextTarget
				},
				pendingMulliganBottom: Math.min(nextPending, nextHandLength)
			};
		}
		case 'toggleTap': {
			let changed = false;
			const battlefield = state.zones.battlefield.map((card) => {
				if (card.instanceId !== action.instanceId) return card;
				changed = true;
				return { ...card, tapped: !card.tapped };
			});
			if (!changed) return state;
			return { ...state, zones: { ...state.zones, battlefield } };
		}
		case 'untapAll': {
			if (!state.zones.battlefield.some((card) => card.tapped)) return state;
			return {
				...state,
				zones: {
					...state.zones,
					battlefield: state.zones.battlefield.map((card) =>
						card.tapped ? { ...card, tapped: false } : card
					)
				}
			};
		}
		case 'adjustCardCounter': {
			if (action.delta === 0) return state;
			let changed = false;
			const battlefield = state.zones.battlefield.map((card) => {
				if (card.instanceId !== action.instanceId) return card;
				changed = true;
				return { ...card, counters: card.counters + action.delta };
			});
			if (!changed) return state;
			return { ...state, zones: { ...state.zones, battlefield } };
		}
		case 'setPhase': {
			if (state.phase === action.phase) return state;
			return { ...state, phase: action.phase };
		}
		case 'stepPhase': {
			const index = PLAYTEST_PHASES.indexOf(state.phase);
			if (action.direction === 'next') {
				if (index === PLAYTEST_PHASES.length - 1) {
					return { ...state, turn: state.turn + 1, phase: PLAYTEST_PHASES[0] };
				}
				return { ...state, phase: PLAYTEST_PHASES[index + 1] };
			}
			if (index === 0) {
				if (state.turn <= 1) return state;
				return {
					...state,
					turn: state.turn - 1,
					phase: PLAYTEST_PHASES[PLAYTEST_PHASES.length - 1]
				};
			}
			return { ...state, phase: PLAYTEST_PHASES[index - 1] };
		}
		case 'nextTurn': {
			return { ...state, turn: state.turn + 1, phase: 'untap' };
		}
		case 'adjustTurn': {
			const nextTurn = Math.max(1, state.turn + action.delta);
			if (nextTurn === state.turn) return state;
			return { ...state, turn: nextTurn };
		}
		case 'adjustLife': {
			if (action.delta === 0) return state;
			return { ...state, life: state.life + action.delta };
		}
		case 'adjustPlayerCounter': {
			const current = state.counters[action.counter];
			const next = Math.max(0, current + action.delta);
			if (next === current) return state;
			return {
				...state,
				counters: {
					...state.counters,
					[action.counter]: next
				}
			};
		}
	}
}

export function handSummary(hand: readonly PlaytestCard[]): HandSummary {
	let lands = 0;
	let nonlands = 0;
	let cmcSum = 0;
	let cmcCount = 0;
	let le1 = 0;
	let le2 = 0;
	let le3 = 0;
	const colorCounts = new Map<string, number>();

	for (const card of hand) {
		const uniqueColors = [...new Set(card.colors)].filter((c) => c in COLOR_LABELS);
		const colorKey =
			uniqueColors.length > 1
				? 'Multicolor'
				: uniqueColors.length === 1
					? COLOR_LABELS[uniqueColors[0]]
					: 'Colorless';
		colorCounts.set(colorKey, (colorCounts.get(colorKey) ?? 0) + 1);

		if (card.isLand) {
			lands += 1;
			continue;
		}
		nonlands += 1;
		if (card.cmc !== null && Number.isFinite(card.cmc) && card.cmc >= 0) {
			cmcSum += card.cmc;
			cmcCount += 1;
			if (card.cmc <= 1) le1 += 1;
			if (card.cmc <= 2) le2 += 1;
			if (card.cmc <= 3) le3 += 1;
		}
	}

	const orderedLabels = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];

	return {
		total: hand.length,
		lands,
		nonlands,
		averageManaValue: cmcCount > 0 ? cmcSum / cmcCount : null,
		manaValueThresholds: { le1, le2, le3 },
		colors: orderedLabels
			.map((label) => ({ label, count: colorCounts.get(label) ?? 0 }))
			.filter((entry) => entry.count > 0)
	};
}
