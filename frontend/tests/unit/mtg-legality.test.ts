import { describe, expect, it } from 'vitest';
import { generateLegalityWarnings, type LegalityLine } from '../../src/lib/server/mtg/legality';

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
