import { expect, it } from 'vitest';
import { describeCategoryConsequence } from '../../src/lib/categories/preview-label.ts';
import type { EntryCategoryDecision, EntryDefinition } from '@spellbook/contracts/categories.ts';
import type { DefinitionVersion } from '@spellbook/contracts/category-library.ts';
const old: EntryDefinition = {
	id: 'same-local',
	origin: 'custom',
	name: 'Artifact engines',
	version: 1,
	policyVersion: 1,
	mappingVersion: 1,
	priority: 0,
	displayOrder: 0,
	rootId: null,
	descendants: false,
	excludeLand: false
};
function snapshot(name: string): DefinitionVersion {
	return {
		id: name,
		originId: 'origin',
		scope: 'entry',
		version: 2,
		name,
		meaning: name + ' meaning',
		priority: 0,
		displayOrder: 0,
		roles: ['main'],
		rule: { op: 'type', value: 'Artifact' },
		createdAt: '2026-10-07T00:00:00Z'
	};
}
function decision(
	categoryId: string | null,
	name: string | null,
	state: EntryCategoryDecision['state'] = 'Automatic'
): EntryCategoryDecision {
	return {
		entryId: 'entry',
		categoryId,
		state,
		revision: '1',
		evidence: null,
		definitionSnapshot: name ? snapshot(name) : null
	};
}
it('shows each frozen before/after meaning when Reset retains the same local category ID', () => {
	expect(describeCategoryConsequence(decision(old.id, old.name))).toBe(
		'Artifact engines (Automatic)'
	);
	expect(describeCategoryConsequence(decision(old.id, 'Permanent engines'))).toBe(
		'Permanent engines (Automatic)'
	);
});
it('labels newly added categories from deep entry-only pages without visible definition differences', () => {
	expect(describeCategoryConsequence(decision('new-local', 'New artifact role'))).toBe(
		'New artifact role (Automatic)'
	);
});
it('preserves Manual historical meaning despite the current adopted label', () => {
	expect(describeCategoryConsequence(decision(old.id, 'Historical artifacts', 'Manual'))).toBe(
		'Historical artifacts (Manual)'
	);
});
it('distinguishes absent decisions, explicit Uncategorized and unavailable frozen definitions', () => {
	expect(describeCategoryConsequence(null)).toBe('Unassigned');
	expect(describeCategoryConsequence(decision(null, null, 'Pending'))).toBe(
		'Uncategorized (Pending)'
	);
	expect(describeCategoryConsequence(decision('missing-local', null))).toBe(
		'Category definition unavailable (Automatic)'
	);
	expect(describeCategoryConsequence(old)).toBe('Artifact engines');
});
