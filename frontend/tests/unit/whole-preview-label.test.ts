import { expect, it } from 'vitest';
import type { WholeCategory } from '@spellbook/contracts/whole-categories.ts';
import { describeWholeCategoryConsequence } from '../../src/lib/categories/whole-preview-label.ts';
function category(): WholeCategory {
	return {
		versionId: 'old-version',
		originId: 'origin',
		name: 'Same label',
		displayOrder: 0,
		suppressed: false,
		automaticActive: true,
		definition: {
			id: 'old-version',
			originId: 'origin',
			scope: 'deck',
			version: 1,
			name: 'Same label',
			meaning: 'At least one Main Creature',
			priority: 0,
			displayOrder: 0,
			roles: ['main'],
			createdAt: '2026-10-08T00:00:00Z',
			rule: { op: 'minimumCopies', minimum: 1, predicate: { op: 'type', value: 'Creature' } }
		},
		decision: {
			versionId: 'old-version',
			state: 'Automatic',
			manual: null,
			truth: 'False',
			attemptedTruth: 'False',
			revision: '1',
			evidence: null,
			previousEvaluation: null
		}
	};
}
it('distinguishes a False criterion from adoption and exposes same-name frozen version meaning', () => {
	const old = category(),
		updated = category();
	updated.versionId = 'new-version';
	updated.definition.version = 2;
	updated.definition.meaning = 'At least two sideboard Creatures';
	updated.definition.roles = ['sideboard'];
	updated.definition.rule = {
		op: 'minimumCopies',
		minimum: 2,
		predicate: { op: 'type', value: 'Creature' }
	};
	expect(describeWholeCategoryConsequence(old)).toMatchObject({
		title: 'Same label, version 1',
		outcome: 'Automatic False; no membership.'
	});
	expect(describeWholeCategoryConsequence(updated)).toMatchObject({
		title: 'Same label, version 2',
		meaning: 'At least two sideboard Creatures',
		versionId: 'new-version',
		criteria: 'At least 2 copies matching Card type Creature Roles: sideboard.'
	});
});
it('shows historical Manual, Pending retained truth and suppression effective outcomes', () => {
	const value = category();
	value.automaticActive = false;
	value.decision!.state = 'Manual';
	value.decision!.manual = 'Include';
	expect(describeWholeCategoryConsequence(value)?.outcome).toBe('Manual Include; membership.');
	value.suppressed = true;
	expect(describeWholeCategoryConsequence(value)?.outcome).toBe(
		'Suppressed; no membership. Stored Manual Include.'
	);
	value.suppressed = false;
	value.automaticActive = true;
	value.decision!.state = 'Pending';
	value.decision!.manual = null;
	value.decision!.truth = 'True';
	value.decision!.attemptedTruth = 'Unknown';
	expect(describeWholeCategoryConsequence(value)?.outcome).toBe(
		'Pending; retained True; membership retained. Latest attempt Unknown.'
	);
	value.decision!.truth = null;
	expect(describeWholeCategoryConsequence(value)?.outcome).toContain(
		'retained no valid result; no membership'
	);
	expect(describeWholeCategoryConsequence(null)).toBeNull();
});
