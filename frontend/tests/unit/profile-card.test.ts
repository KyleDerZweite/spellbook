import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getManaFontClass } from '../../src/lib/utils/manaCostParser';
import {
	defaultProfileCard,
	insertProfileKpi,
	profileTextSegments,
	resolveProfileText,
	validateProfileCard,
	validProfileManaCost,
	PROFILE_CARD_LIMITS,
	PROFILE_CARD_LINE_LIMITS
} from '../../src/lib/profile/card';

const totals = { total: 1234, names: 43, printings: 50, sets: 8, foils: 6, decks: 2 };

describe('profile card definitions and live metrics', () => {
	it('accepts the default definition and stores tokens rather than resolved totals', () => {
		const card = defaultProfileCard('Kyle');
		expect(validateProfileCard(card)).toEqual({ success: true, value: card });
		expect(resolveProfileText(card.rulesText, totals)).toContain('1,234 cards');
		expect(card.rulesText).toContain('{total_owned_cards}');
	});
	it('resolves every metric, repeated tokens, zero values and unavailable data', () => {
		const template =
			'{total_owned_cards} {unique_card_names} {owned_printings} {owned_sets} {foil_copies} {total_decks} {total_decks}';
		expect(resolveProfileText(template, totals)).toBe('1,234 43 50 8 6 2 2');
		expect(resolveProfileText('{total_owned_cards}', { ...totals, total: 0 })).toBe('0');
		expect(resolveProfileText('{total_owned_cards}', null)).toBe('unavailable');
		expect(resolveProfileText('{unknown}', totals)).toBe('{unknown}');
	});
	it('preserves literal HTML as text and does not evaluate expressions', () => {
		const text = '<img src=x onerror=alert(1)> ${alert(1)}';
		expect(resolveProfileText(text, totals)).toBe(text);
	});
	it('separates supported mana symbols from plain text without interpreting HTML', () => {
		expect(profileTextSegments('{T}: Add {G}. Own {total_decks} decks.', totals)).toEqual([
			{ type: 'mana', value: '{T}' },
			{ type: 'text', value: ': Add ' },
			{ type: 'mana', value: '{G}' },
			{ type: 'text', value: '. Own 2 decks.' }
		]);
	});
	it('inserts at the caret or replaces a selection without losing surrounding text', () => {
		expect(insertProfileKpi('Own cards.', 4, 4, 'total_owned_cards')).toEqual({
			text: 'Own {total_owned_cards}cards.',
			caret: 23
		});
		expect(insertProfileKpi('Own many cards.', 4, 8, 'total_owned_cards').text).toBe(
			'Own {total_owned_cards} cards.'
		);
	});
	it('accepts basic, hybrid and phyrexian mana while rejecting partial or unsupported input', () => {
		for (const cost of ['', '{X}{X}{R}', '{20}{W/U}{2/G}{B/P}', '{C/U}{G/U/P}{1000000}'])
			expect(validProfileManaCost(cost)).toBe(true);
		for (const cost of ['{21}', '{unknown}', '{R}junk', '{R', '{R} '.trimStart(), '{G}'.repeat(9)])
			expect(validProfileManaCost(cost)).toBe(false);
	});
	it('renders supported action and hybrid symbols using glyphs in the installed font', () => {
		const css = readFileSync(
			new URL('../../node_modules/mana-font/css/mana.css', import.meta.url),
			'utf8'
		);
		for (const [symbol, glyph] of [
			['Q', 'ms-untap'],
			['T', 'ms-tap'],
			['E', 'ms-e'],
			['G/U/P', 'ms-gup'],
			['C/U', 'ms-cu']
		]) {
			expect(getManaFontClass(symbol)).toBe(glyph);
			expect(css).toContain(`.${glyph}::before`);
		}
		expect(
			validateProfileCard({
				...defaultProfileCard('Kyle'),
				rulesText: '{Q}: Gain {E}. Pay {G/U/P}.'
			}).success
		).toBe(true);
	});
	it('rejects unsupported templates, extra properties, invalid enums and field types', () => {
		const card = defaultProfileCard('Kyle');
		for (const patch of [
			{ template: 'pokemon' },
			{ accountId: 'foreign' },
			{ frame: 'invalid' },
			{ legendary: 'true' },
			{ rarity: 'ranked' },
			{ name: 4 },
			{ rulesText: null }
		]) {
			expect(validateProfileCard({ ...card, ...patch }).success).toBe(false);
		}
	});
	it('rejects unknown or unclosed tokens with field errors and retains known mana in text', () => {
		const card = defaultProfileCard('Kyle');
		for (const rulesText of ['{unknown}', '{total_owned_cards', '{{total_owned_cards}}']) {
			expect(validateProfileCard({ ...card, rulesText })).toMatchObject({
				success: false,
				errors: { rulesText: expect.any(String) }
			});
		}
		expect(
			validateProfileCard({ ...card, rulesText: '{T}: Add {G}. Own {total_owned_cards} cards.' })
				.success
		).toBe(true);
	});
	it('limits Power/Toughness to card values and a single KPI', () => {
		const card = defaultProfileCard('Kyle');
		for (const power of ['0', '-1', '9999999', '*', 'X', '1+*', '*-1', '{total_owned_cards}'])
			expect(validateProfileCard({ ...card, power, toughness: '1' }).success).toBe(true);
		for (const power of [
			'a whole sentence',
			'99999999',
			'{total_owned_cards} cards',
			'{total_decks}{foil_copies}'
		])
			expect(validateProfileCard({ ...card, power, toughness: '1' })).toMatchObject({
				success: false,
				errors: { power: expect.any(String) }
			});
	});

	it('requires paired Power and Toughness, supports their KPIs and validates content limits', () => {
		const card = defaultProfileCard('Kyle');
		expect(
			validateProfileCard({ ...card, power: '{total_owned_cards}', toughness: '{total_decks}' })
				.success
		).toBe(true);
		expect(validateProfileCard({ ...card, power: '1' })).toMatchObject({
			success: false,
			errors: { toughness: expect.any(String) }
		});
		for (const patch of [
			{ name: '' },
			{ name: 'x'.repeat(PROFILE_CARD_LIMITS.name + 1) },
			{ typeLine: 'x\ny' },
			{ rulesText: 'x'.repeat(PROFILE_CARD_LIMITS.rulesText + 1) },
			{ flavorText: 'x'.repeat(PROFILE_CARD_LIMITS.flavorText + 1) },
			{ power: 'x'.repeat(PROFILE_CARD_LIMITS.power + 1), toughness: '1' },
			{
				rulesText: Array(PROFILE_CARD_LINE_LIMITS.rulesText + 1)
					.fill('line')
					.join('\n')
			},
			{
				flavorText: Array(PROFILE_CARD_LINE_LIMITS.flavorText + 1)
					.fill('line')
					.join('\n')
			}
		])
			expect(validateProfileCard({ ...card, ...patch }).success).toBe(false);
	});
});
