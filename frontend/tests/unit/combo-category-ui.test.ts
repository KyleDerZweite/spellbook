import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { ComboEvidence as Evidence } from '@spellbook/contracts/combo.ts';
import type { DeckRule } from '@spellbook/contracts/category-library.ts';
import ComboEvidence from '../../src/lib/components/categories/ComboEvidence.svelte';
import RuleEditor from '../../src/lib/components/categories/RuleEditor.svelte';
import { defaultRule, readRuleForm, ruleSelections } from '../../src/lib/categories/rule-form.ts';
import { describeCategoryRule } from '../../src/lib/categories/rule-summary.ts';

it('creates scope-specific combo criteria and retains nested outcome IDs during searches', () => {
	for (const [scope, op] of [
		['entry', 'comboParticipant'],
		['deck', 'comboOutcome']
	] as const) {
		const form = new FormData();
		form.set('rule', JSON.stringify(defaultRule(scope)));
		form.set('rule.root.op', op);
		form.set('ruleAction', 'update');
		expect(readRuleForm(form, scope)).toEqual({
			op,
			outcomeId: '',
			policyVersion: 'ingredients-v1'
		});
	}
	const rule: DeckRule = {
		op: 'all',
		children: [
			{ op: 'comboOutcome', outcomeId: '2244', policyVersion: 'ingredients-v1' },
			{
				op: 'minimumCopies',
				minimum: 2,
				predicate: {
					op: 'not',
					child: { op: 'comboParticipant', outcomeId: 'old', policyVersion: 'ingredients-v1' }
				}
			}
		]
	};
	const form = new FormData();
	form.set('rule', JSON.stringify(rule));
	form.set('rule.root.0.outcomeId', 'new');
	form.set('ruleAction', 'choices');
	const updated = readRuleForm(form, 'deck');
	expect(ruleSelections(updated).outcomeIds).toEqual(['new', 'old']);
	expect(describeCategoryRule(updated)).toContain('outcome old');
});

it('renders unavailable saved outcome IDs as selected native options', async () => {
	const { body } = await render(RuleEditor, {
		props: {
			rule: { op: 'comboParticipant', outcomeId: 'old', policyVersion: 'ingredients-v1' },
			scope: 'entry',
			choices: { tags: [], cards: [] }
		}
	});
	expect(body).toContain('name="rule.root.outcomeId"');
	expect(body).toContain('value="old" selected');
	expect(body).toContain('currently unavailable');
	expect(body).toContain('Documented combo participant');
});

const evidence: Evidence = {
	source: {
		enabled: true,
		availability: 'Available',
		publicationId: 'pub',
		policyVersion: 'ingredients-v1',
		refreshStatus: { kind: 'Failed' },
		sourceTime: '2026-10-08',
		sourceVersion: 'v1',
		payloadDigest: 'digest',
		decodedDigest: 'decoded',
		parserVersion: 1
	},
	evaluations: [
		{
			outcomeId: '2244',
			roles: ['main', 'commander'],
			truth: 'True',
			proof: {
				publicationId: 'pub',
				outcomeId: '2244',
				roles: ['main', 'commander'],
				policyVersion: 'ingredients-v1',
				parserVersion: 1,
				variant: {
					id: '2850-4186/?<script>',
					status: 'OK',
					outcomeIds: ['2244'],
					unsupportedReasons: [],
					ingredients: [
						{
							oracleId: 'oracle',
							name: '<script>Oak</script>',
							quantity: '2',
							mustBeCommander: true,
							zones: ['Hand', 'Battlefield'],
							usedFace: null,
							states: { battlefield: 'untapped' }
						}
					],
					mana: '{2}{G}',
					prerequisites: 'Have a creature.',
					steps: 'Activate ability.',
					notes: '',
					templates: [],
					producedOutcomes: [
						{
							id: '2244',
							name: 'Infinite +1/+1 counters',
							status: 'OK',
							uncountable: true,
							quantity: '1'
						}
					]
				}
			}
		}
	]
};
it('uses separately resolved selected outcomes when they are outside the bounded search', async () => {
	const { body } = await render(RuleEditor, {
		props: {
			rule: { op: 'comboOutcome', outcomeId: 'saved', policyVersion: 'ingredients-v1' },
			scope: 'deck',
			choices: {
				tags: [],
				cards: [],
				combo: {
					source: evidence.source,
					outcomes: [{ id: 'search', name: 'Search result' }],
					selectedOutcomes: [{ id: 'saved', name: 'Saved outcome' }]
				}
			}
		}
	});
	expect(body).toContain('value="saved" selected');
	expect(body).toContain('Saved outcome');
	expect(body).toContain('Search result');
	expect(body).not.toContain('Previously selected outcome saved');
});

it('renders saved proof, unchecked conditions and safe credited links without source HTML', async () => {
	const { body } = await render(ComboEvidence, {
		props: { evidence, label: 'Retained valid combo evidence, stale' }
	});
	expect(body).toContain('Retained valid combo evidence, stale');
	expect(body).toContain('Latest source refresh failed');
	expect(body).toContain('https://commanderspellbook.com/combo/2850-4186%2F%3F%3Cscript%3E/');
	expect(body).toContain('&lt;script>Oak&lt;/script>');
	expect(body).not.toContain('<script>Oak</script>');
	for (const text of [
		'2 ×',
		'requires Commander role',
		'Hand, Battlefield',
		'untapped',
		'{2}{G}',
		'Unchecked prerequisites',
		'Infinite +1/+1 counters',
		'Parser 1',
		'ingredients-v1'
	])
		expect(body).toContain(text);
});
it('renders a latest Unknown attempt separately from an ingredient proof', async () => {
	const unknown: Evidence = {
		...evidence,
		evaluations: [{ outcomeId: '2244', roles: ['main'], truth: 'Unknown', proof: null }]
	};
	const { body } = await render(ComboEvidence, {
		props: { evidence: unknown, label: 'Latest Unknown combo attempt' }
	});
	expect(body).toContain('Latest Unknown combo attempt');
	expect(body).toContain('Unknown remains Unknown under negation');
	expect(body).not.toContain('Documented ingredients are present');
});
