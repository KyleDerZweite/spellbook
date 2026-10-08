import { describe, expect, it } from 'vitest';
import {
	evaluateComboVariants,
	type ComboMatcherInput
} from '@spellbook/backend/categories/combo-matcher.ts';
import type { ComboCompositionEntry, ComboVariant } from '@spellbook/contracts/combo.ts';

// Recorded official variant 2850-4186, retrieved 2026-10-08. The reduced fields
// preserve the public fixture described in docs/architecture/category-rules.md.
const oakVariant: ComboVariant = {
	id: '2850-4186',
	status: 'OK',
	ingredients: [
		{
			oracleId: 'eee6c02b-7d6a-4445-ad27-8b03176147d4',
			name: 'Scurry Oak',
			quantity: '1',
			mustBeCommander: false,
			zones: ['H'],
			usedFace: null,
			states: {
				battlefieldCardState: '',
				exileCardState: '',
				graveyardCardState: '',
				libraryCardState: ''
			}
		},
		{
			oracleId: 'a5da5ad6-4ed2-4041-a983-76a8c87fa109',
			name: 'Ivy Lane Denizen',
			quantity: '1',
			mustBeCommander: false,
			zones: ['B'],
			usedFace: null,
			states: {
				battlefieldCardState: '',
				exileCardState: '',
				graveyardCardState: '',
				libraryCardState: ''
			}
		}
	],
	outcomeIds: ['2244', '21', '4'],
	producedOutcomes: [
		{
			id: '2244',
			name: 'Infinite +1/+1 counters on a creature',
			status: 'C',
			uncountable: true,
			quantity: '1'
		},
		{
			id: '21',
			name: 'Infinite creature tokens',
			status: 'S',
			uncountable: true,
			quantity: '1'
		},
		{
			id: '4',
			name: 'Infinite creature ETB',
			status: 'H',
			uncountable: true,
			quantity: '1'
		}
	],
	unsupportedReasons: [],
	mana: '{2}{G}',
	prerequisites: '\n',
	steps:
		"Cast Scurry Oak by paying {2}{G}.\nIvy Lane Denizen triggers, putting a +1/+1 counter on Scurry Oak.\nScurry Oak's last ability triggers, allowing you to create a 1/1 Squirrel token.\nRepeat from step 2.",
	notes: '',
	templates: []
};

const oak = oakVariant.ingredients[0].oracleId!;
const denizen = oakVariant.ingredients[1].oracleId!;
const other = '00000000-0000-4000-8000-000000000099';
function entry(
	entryId: string,
	oracleId: string | null,
	role: ComboCompositionEntry['role'] = 'main',
	quantity = 1
): ComboCompositionEntry {
	return { entryId, oracleId, role, quantity, printingId: oracleId ?? entryId };
}
function run(
	entries: ComboCompositionEntry[],
	variants: ComboVariant[] = [oakVariant],
	overrides: Partial<ComboMatcherInput> = {}
) {
	return evaluateComboVariants({
		entries,
		variants,
		roles: ['main', 'commander'],
		outcomeId: '2244',
		publication: {
			publicationId: 'publication',
			parserVersion: 1,
			complete: true,
			outcomePresent: true
		},
		...overrides
	});
}
function variant(
	ingredients: ComboVariant['ingredients'],
	overrides: Partial<ComboVariant> = {}
): ComboVariant {
	return { ...oakVariant, ingredients, ...overrides };
}

describe('local documented combo ingredients', () => {
	it('matches the exact recorded Oak/Denizen variant and disproves Oak alone', () => {
		const result = run([entry('oak', oak), entry('denizen', denizen), entry('other', other)]);
		expect(result.truth).toBe('True');
		expect(result.participants).toEqual({ oak: 'True', denizen: 'True', other: 'False' });
		expect(result.proof?.variant).toEqual(oakVariant);
		expect(result.proof?.variant.mana).toBe('{2}{G}');
		expect(result.proof?.variant.ingredients.map((ingredient) => ingredient.zones)).toEqual([
			['H'],
			['B']
		]);
		expect(run([entry('oak', oak)]).truth).toBe('False');
	});
	it('aggregates repeated ingredients and alternate printings with exact decimal quantities', () => {
		const repeated = variant([
			{ ...oakVariant.ingredients[0], quantity: '2147483647' },
			{ ...oakVariant.ingredients[0], quantity: '2147483648' }
		]);
		expect(
			run(
				[
					entry('a', oak, 'main', 2147483647),
					{ ...entry('b', oak, 'main', 2147483647), printingId: 'alternate' },
					entry('c', oak)
				],
				[repeated]
			).truth
		).toBe('True');
		expect(run([entry('a', oak, 'main', 2147483647)], [repeated]).truth).toBe('False');
		expect(
			run(
				[entry('a', oak, 'main', 2147483647)],
				[variant([{ ...oakVariant.ingredients[0], quantity: '9007199254740993' }])]
			).truth
		).toBe('False');
	});
	it('preserves Entry and role authority for a commander-only ingredient of the same printing', () => {
		const commander = variant([
			{ ...oakVariant.ingredients[0], mustBeCommander: true },
			oakVariant.ingredients[1]
		]);
		const result = run(
			[entry('commander-a', oak, 'commander'), entry('main-a', oak), entry('main-b', denizen)],
			[commander]
		);
		expect(result.truth).toBe('True');
		expect(result.participants).toEqual({
			'commander-a': 'True',
			'main-a': 'False',
			'main-b': 'True'
		});
		expect(run([entry('main-a', oak), entry('main-b', denizen)], [commander]).truth).toBe('False');
	});
	it('cannot double-count one Commander copy for ordinary and commander requirements', () => {
		const mixed = variant([
			{ ...oakVariant.ingredients[0], mustBeCommander: true },
			oakVariant.ingredients[0]
		]);
		expect(run([entry('commander', oak, 'commander')], [mixed]).truth).toBe('False');
		expect(run([entry('commander', oak, 'commander'), entry('main', oak)], [mixed]).truth).toBe(
			'True'
		);
		expect(
			run([entry('main', oak, 'main', 2), entry('unknown', null, 'commander')], [mixed]).truth
		).toBe('Unknown');
	});
	it('counts unknown identity only as possible quantity and restricts commander upper bounds', () => {
		expect(run([entry('oak', oak), entry('unknown', null)]).truth).toBe('Unknown');
		expect(run([entry('oak', oak), entry('unknown', null)]).participants.unknown).toBe('Unknown');
		const commander = variant([
			{ ...oakVariant.ingredients[0], mustBeCommander: true },
			oakVariant.ingredients[1]
		]);
		expect(run([entry('unknown', null), entry('denizen', denizen)], [commander]).truth).toBe(
			'False'
		);
		expect(
			run([entry('unknown', null, 'commander'), entry('denizen', denizen)], [commander]).truth
		).toBe('Unknown');
		const needTwo = variant([
			{ ...oakVariant.ingredients[0], quantity: '2' },
			{ ...oakVariant.ingredients[1], quantity: '2' }
		]);
		expect(
			run(
				[
					entry('oak', oak),
					entry('denizen', denizen),
					entry('unknown', null),
					entry('other', other)
				],
				[needTwo]
			).truth
		).toBe('False');
	});
	it('uses only selected roles and treats gameplay zones as displayed prerequisites', () => {
		expect(run([entry('oak', oak), entry('denizen', denizen, 'sideboard')]).truth).toBe('False');
		expect(
			run([entry('oak', oak), entry('denizen', denizen, 'sideboard')], [oakVariant], {
				roles: ['sideboard', 'main']
			}).truth
		).toBe('True');
		expect(
			run([entry('oak', oak), entry('denizen', denizen, 'companion')]).participants.denizen
		).toBe('False');
	});
	it.each([
		variant([{ ...oakVariant.ingredients[0], oracleId: null }, oakVariant.ingredients[1]]),
		variant([{ ...oakVariant.ingredients[0], usedFace: 1 }, oakVariant.ingredients[1]]),
		variant([{ ...oakVariant.ingredients[0], zones: ['unrecognized'] }, oakVariant.ingredients[1]]),
		variant([
			{ ...oakVariant.ingredients[0], states: { battlefieldCardState: 'tapped' } },
			oakVariant.ingredients[1]
		]),
		variant(oakVariant.ingredients, { status: 'unrecognized' }),
		variant(oakVariant.ingredients, { unsupportedReasons: ['unknown-field'] }),
		variant(oakVariant.ingredients, {
			templates: [
				{
					id: 'template',
					name: 'Creature',
					query: 't:creature',
					quantity: '1',
					zones: ['B'],
					states: {},
					mustBeCommander: false,
					usedFace: null
				}
			]
		})
	])('retains potentially satisfiable unsupported variants as Unknown', (candidate) => {
		expect(run([entry('oak', oak), entry('denizen', denizen)], [candidate]).truth).toBe('Unknown');
		expect(run([entry('oak', oak)], [candidate]).truth).toBe('False');
	});
	it('requires a complete publication containing the requested outcome for absence', () => {
		for (const publication of [
			null,
			{ publicationId: 'p', parserVersion: 1, complete: false, outcomePresent: true },
			{ publicationId: 'p', parserVersion: 1, complete: true, outcomePresent: false }
		]) {
			const result = run([entry('a', oak), entry('excluded', oak, 'sideboard')], [], {
				publication
			});
			expect(result.truth).toBe('Unknown');
			expect(result.participants).toEqual({ a: 'Unknown', excluded: 'False' });
		}
		expect(run([], []).truth).toBe('False');
	});
	it('selects stable proof while participants can come from every True variant', () => {
		const second = variant([{ ...oakVariant.ingredients[0], oracleId: other }], { id: 'aaa' });
		const result = run(
			[entry('oak', oak), entry('denizen', denizen), entry('other', other)],
			[oakVariant, second],
			{ roles: ['commander', 'main', 'main'] }
		);
		expect(result.participants).toEqual({ oak: 'True', denizen: 'True', other: 'True' });
		expect(result.proof?.variant.id).toBe('2850-4186');
		expect(result.participantProofs.other.variant.id).toBe('aaa');
		expect(result.participantProofs.oak.variant.id).toBe('2850-4186');
		expect(result.roles).toEqual(['main', 'commander']);
		expect(
			run(
				[entry('oak', oak), entry('denizen', denizen), entry('other', other)],
				[second, oakVariant]
			)
		).toEqual(result);
	});
	it('preserves unknown potential participants alongside a positive proof', () => {
		const unsupported = variant([{ ...oakVariant.ingredients[0], oracleId: other }], {
			status: 'DRAFT'
		});
		const result = run(
			[entry('oak', oak), entry('denizen', denizen), entry('other', other), entry('unknown', null)],
			[oakVariant, unsupported]
		);
		expect(result.truth).toBe('True');
		expect(result.participants).toEqual({
			oak: 'True',
			denizen: 'True',
			other: 'Unknown',
			unknown: 'Unknown'
		});
	});
	it('keeps uncertain Commander-only identities and templates outside Main participation', () => {
		const commanderOnly = variant(
			[{ ...oakVariant.ingredients[0], oracleId: null, mustBeCommander: true }],
			{ unsupportedReasons: ['oracle-id'] }
		);
		const entries = [entry('unknown-commander', null, 'commander'), entry('known-main', other)];
		const result = run(entries, [commanderOnly]);
		expect(result.truth).toBe('Unknown');
		expect(result.participants).toEqual({ 'unknown-commander': 'Unknown', 'known-main': 'False' });
		const template = {
			id: 'commander-template',
			name: 'Commander',
			query: null,
			quantity: '1',
			zones: ['B'],
			states: {},
			mustBeCommander: true,
			usedFace: null
		};
		const templateOnly = variant([], {
			templates: [template],
			unsupportedReasons: ['empty-ingredients', 'templates']
		});
		expect(run(entries, [templateOnly]).participants).toEqual(result.participants);
		expect(
			run(entries, [
				variant([], {
					templates: [{ ...template, mustBeCommander: false }],
					unsupportedReasons: ['empty-ingredients', 'templates']
				})
			]).participants['known-main']
		).toBe('Unknown');
	});
	it.each([0, -1, 1.5, 2147483648, Number.NaN])(
		'rejects corrupt persisted quantities %s',
		(quantity) => {
			expect(() => run([entry('bad', oak, 'main', quantity)])).toThrow(/integrity/);
		}
	);
	it.each(['used-face', 'card-state', 'status', 'zones'])(
		'keeps unrelated proven identities False for unsupported %s constraints',
		(reason) => {
			const unsupported = variant(oakVariant.ingredients, { unsupportedReasons: [reason] });
			const result = run(
				[entry('oak', oak), entry('denizen', denizen), entry('other', other)],
				[unsupported]
			);
			expect(result.participants).toEqual({ oak: 'Unknown', denizen: 'Unknown', other: 'False' });
			expect(result.participantProofs).toEqual({});
		}
	);
	it.each(['variant-shape', 'ingredient-shape', 'empty-ingredients', 'future-structural-field'])(
		'keeps unidentified potential participants Unknown for %s',
		(reason) => {
			const result = run(
				[entry('oak', oak), entry('denizen', denizen), entry('other', other)],
				[variant(oakVariant.ingredients, { unsupportedReasons: [reason] })]
			);
			expect(result.participants.other).toBe('Unknown');
		}
	);
	it.each([
		variant([{ ...oakVariant.ingredients[0], usedFace: 1 }, oakVariant.ingredients[1]]),
		variant([
			{ ...oakVariant.ingredients[0], states: { battlefieldCardState: 'tapped' } },
			oakVariant.ingredients[1]
		])
	])('does not broaden concrete face or state ingredients to unrelated cards', (unsupported) => {
		const result = run(
			[entry('oak', oak), entry('denizen', denizen), entry('other', other)],
			[unsupported]
		);
		expect(result.participants).toEqual({ oak: 'Unknown', denizen: 'Unknown', other: 'False' });
	});
});
