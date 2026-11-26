import { describe, expect, it } from 'vitest';
import {
	DECK_RULES_VERSION,
	generateLegalityWarnings,
	type LegalityLine
} from '@spellbook/contracts/legality.ts';

describe('generateLegalityWarnings', () => {
	it('counts only main and commanders toward Commander size', () => {
		const lines = [
			line({ quantity: 99, card: card({ name: 'Plains', type_line: 'Basic Land' }) }),
			line({ role: 'commander' }),
			line({ role: 'companion' })
		];
		expect(
			generateLegalityWarnings(lines, 'Commander').some((w) => w.code === 'commander_size')
		).toBe(false);
	});
	it('checks Commander singleton across printings and respects card exceptions', () => {
		expect(
			generateLegalityWarnings([line({ quantity: 2 })], 'Commander').some(
				(w) => w.code === 'commander_singleton'
			)
		).toBe(true);
		expect(
			generateLegalityWarnings(
				[
					line({
						quantity: 8,
						card: card({
							oracle_text: 'A deck can have any number of cards named Relentless Rats.'
						})
					})
				],
				'Commander'
			).some((w) => w.code === 'commander_singleton')
		).toBe(false);
	});
	it('allows one restricted Vintage card and warns on two', () => {
		const restricted = card({ legalities: { vintage: 'restricted' } });
		expect(
			generateLegalityWarnings([line({ card: restricted })], 'Vintage').some(
				(w) => w.code === 'format_illegal' || w.code === 'restricted_copies'
			)
		).toBe(false);
		expect(
			generateLegalityWarnings([line({ card: restricted, quantity: 2 })], 'Vintage').some(
				(w) => w.code === 'restricted_copies'
			)
		).toBe(true);
	});
	it('does not apply constructed copy limits to draft or maybeboard', () => {
		expect(generateLegalityWarnings([line({ quantity: 8 })], 'Draft')).toEqual([]);
		expect(
			generateLegalityWarnings(
				[
					line({
						quantity: 8,
						role: 'maybeboard',
						card: card({ legalities: { modern: 'banned' } })
					})
				],
				'Modern'
			)
		).toEqual([{ code: 'main_under_60', message: 'Main deck has fewer than 60 cards.' }]);
	});

	it('warns when sideboard is over 15', () => {
		const warnings = generateLegalityWarnings(
			[line({ quantity: 16, role: 'sideboard' })],
			'Standard'
		);
		expect(warnings.some((warning) => warning.code === 'sideboard_over_15')).toBe(true);
	});

	it('warns when constructed main deck is under 60', () => {
		const warnings = generateLegalityWarnings([line({ quantity: 4 })], 'Standard');
		expect(warnings.some((warning) => warning.code === 'main_under_60')).toBe(true);
	});

	it('warns when more than 4 copies are present', () => {
		const warnings = generateLegalityWarnings([line({ quantity: 5 })], 'Modern');
		expect(warnings.some((warning) => warning.code === 'too_many_copies')).toBe(true);
	});

	it('warns when a card is illegal in the target format', () => {
		const warnings = generateLegalityWarnings(
			[line({ card: card({ legalities: { standard: 'not_legal' } }) })],
			'Standard'
		);
		expect(warnings.some((warning) => warning.code === 'format_illegal')).toBe(true);
	});

	it('warns when commander size is not 100', () => {
		const warnings = generateLegalityWarnings(
			[line({ quantity: 1, role: 'commander' })],
			'Commander'
		);
		expect(warnings.some((warning) => warning.code === 'commander_size')).toBe(true);
	});

	it('covers all supported constructed formats under deck-rules v1', () => {
		expect(DECK_RULES_VERSION).toBe('v1');
		for (const format of ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper']) {
			const key = format.toLowerCase();
			const plains = card({
				oracle_id: 'plains',
				name: 'Plains',
				type_line: 'Basic Land — Plains',
				color_identity: ['W'],
				legalities: { [key]: 'legal' }
			});
			const spell = card({
				oracle_id: 'spell',
				name: 'Opt',
				type_line: 'Instant',
				color_identity: ['U'],
				legalities: { [key]: 'legal' }
			});
			expect(
				generateLegalityWarnings(
					[
						line({ quantity: 56, card: plains }),
						line({ quantity: 4, card: spell }),
						line({ quantity: 15, role: 'sideboard', card: plains })
					],
					format
				)
			).toEqual([]);
		}
	});

	it('validates Commander color identity against chosen commanders', () => {
		const commander = card({
			oracle_id: 'thalia',
			name: 'Thalia, Guardian of Thraben',
			type_line: 'Legendary Creature — Human Soldier',
			color_identity: ['W'],
			legalities: { commander: 'legal' }
		});
		const plains = card({
			oracle_id: 'plains',
			name: 'Plains',
			type_line: 'Basic Land — Plains',
			color_identity: ['W'],
			legalities: { commander: 'legal' }
		});
		const bolt = card({
			oracle_id: 'bolt',
			name: 'Lightning Bolt',
			type_line: 'Instant',
			color_identity: ['R'],
			legalities: { commander: 'legal' }
		});
		const warnings = generateLegalityWarnings(
			[
				line({ role: 'commander', card: commander }),
				line({ quantity: 98, card: plains }),
				line({ quantity: 1, card: bolt })
			],
			'Commander'
		);
		expect(warnings.map((w) => w.code)).toEqual(['commander_color_identity']);
	});

	it('validates Commander eligibility and 2-commander pairings', () => {
		const wastes = card({
			oracle_id: 'wastes',
			name: 'Wastes',
			type_line: 'Basic Land',
			color_identity: [],
			legalities: { commander: 'legal' }
		});
		const ineligible = card({
			oracle_id: 'bear',
			name: 'Grizzly Bears',
			type_line: 'Creature — Bear',
			color_identity: ['G'],
			legalities: { commander: 'legal' }
		});
		expect(
			generateLegalityWarnings(
				[line({ role: 'commander', card: ineligible }), line({ quantity: 99, card: wastes })],
				'Commander'
			).map((w) => w.code)
		).toEqual(['commander_ineligible']);

		const wilson = card({
			oracle_id: 'wilson',
			name: 'Wilson, Refined Grizzly',
			type_line: 'Legendary Creature — Bear Warrior',
			oracle_text: 'Choose a Background',
			keywords: ['Choose a Background'],
			color_identity: ['G'],
			legalities: { commander: 'legal' }
		});
		const background = card({
			oracle_id: 'noble-heritage',
			name: 'Noble Heritage',
			type_line: 'Legendary Enchantment — Background',
			color_identity: ['W'],
			legalities: { commander: 'legal' }
		});
		expect(
			generateLegalityWarnings(
				[
					line({ role: 'commander', card: wilson }),
					line({ role: 'commander', card: background }),
					line({ quantity: 98, card: wastes })
				],
				'Commander'
			)
		).toEqual([]);

		const doctor = card({
			oracle_id: 'tenth-doctor',
			name: 'The Tenth Doctor',
			type_line: 'Legendary Creature — Time Lord Doctor',
			color_identity: ['U', 'R'],
			legalities: { commander: 'legal' }
		});
		const companion = card({
			oracle_id: 'rose-tyler',
			name: 'Rose Tyler',
			type_line: 'Legendary Creature — Human',
			oracle_text: "Doctor's companion",
			keywords: ["Doctor's companion"],
			color_identity: ['W'],
			legalities: { commander: 'legal' }
		});
		expect(
			generateLegalityWarnings(
				[
					line({ role: 'commander', card: doctor }),
					line({ role: 'commander', card: companion }),
					line({ quantity: 98, card: wastes })
				],
				'Commander'
			)
		).toEqual([]);

		expect(
			generateLegalityWarnings(
				[
					line({ role: 'commander', card: wilson }),
					line({ role: 'commander', card: doctor }),
					line({ quantity: 98, card: wastes })
				],
				'Commander'
			).map((w) => w.code)
		).toEqual(['commander_invalid_pairing']);

		expect(
			generateLegalityWarnings(
				[line({ quantity: 10_000_000, role: 'commander', card: wilson })],
				'Commander'
			).map((w) => w.code)
		).toEqual(['commander_singleton', 'commander_size', 'commander_count']);
	});
});

function line(overrides: Partial<LegalityLine>): LegalityLine {
	return {
		quantity: 1,
		role: 'main',
		card: card({}),
		...overrides
	};
}

function card(overrides: Record<string, unknown>) {
	return {
		id: 'card-1',
		oracle_id: 'oracle-1',
		name: 'Lightning Bolt',
		lang: 'en',
		released_at: '',
		layout: 'normal',
		mana_cost: '',
		cmc: 1,
		type_line: 'Instant',
		oracle_text: '',
		colors: ['R'],
		color_identity: ['R'],
		keywords: [],
		card_types: ['Instant'],
		rarity: 'common',
		set_code: 'sta',
		set_name: '',
		collector_number: '42',
		image_uri: '',
		image_uri_small: '',
		is_foil_available: true,
		is_nonfoil_available: true,
		legalities: {},
		...overrides
	};
}
