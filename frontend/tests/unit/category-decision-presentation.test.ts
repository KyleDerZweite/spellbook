import { describe, expect, it } from 'vitest';
import type {
	DeckEntryCategories,
	EntryCategoryDecision,
	EntryDefinition
} from '@spellbook/contracts/categories.ts';
import type { DefinitionVersion } from '@spellbook/contracts/category-library.ts';
import {
	categoryDecisionPresentation,
	categoryGroupLabel,
	categoryGroupIdentity,
	categoryPredicateLabel
} from '#lib/categories/decision-presentation.ts';

const version: DefinitionVersion = {
	id: 'version-one',
	originId: 'origin',
	version: 1,
	scope: 'entry',
	name: 'Draw',
	meaning: 'Draw a card',
	priority: 0,
	displayOrder: 1,
	roles: ['main'],
	rule: { op: 'type', value: 'Artifact' },
	createdAt: '2026-10-08T00:00:00Z'
};
const definition: EntryDefinition = {
	id: 'local',
	origin: 'custom',
	originId: 'origin',
	definitionVersionId: 'version-two',
	version: 2,
	policyVersion: 1,
	mappingVersion: 1,
	name: 'Infinite Counter',
	meaning: 'Counter an artifact',
	priority: 0,
	displayOrder: 1,
	rootId: null,
	descendants: false,
	excludeLand: false
};
const decision: EntryCategoryDecision = {
	entryId: 'entry',
	categoryId: 'local',
	state: 'Manual',
	revision: '1',
	evidence: null,
	definitionSnapshot: version
};
const categories: DeckEntryCategories = {
	deckId: 'deck',
	initialized: true,
	decisionRevision: '2',
	definitions: [definition],
	decisions: [decision],
	sourceStatus: { kind: 'Succeeded', sourceTime: null }
};
describe('saved category meaning presentation', () => {
	it('separates a retained Manual meaning from a newer definition sharing its local ID', () => {
		expect(categoryDecisionPresentation(categories, decision)).toMatchObject({
			name: 'Draw',
			historical: true,
			snapshot: { version: 1, meaning: 'Draw a card' }
		});
		expect(categoryGroupLabel(categories, decision)).toBe('Draw (saved Manual version 1)');
		expect(
			categoryGroupLabel(categories, {
				...decision,
				state: 'Automatic',
				definitionSnapshot: { ...version, id: 'version-two', version: 2, name: 'Infinite Counter' }
			})
		).toBe('Infinite Counter');
	});
	it('preserves local label-only rename for the same meaning and distinguishes same-name version changes', () => {
		expect(
			categoryDecisionPresentation(
				{
					...categories,
					definitions: [{ ...definition, definitionVersionId: version.id, name: 'Local label' }]
				},
				decision
			)
		).toMatchObject({ name: 'Local label', historical: false });
		expect(
			categoryGroupLabel(
				{ ...categories, definitions: [{ ...definition, name: 'Draw' }] },
				decision
			)
		).toBe('Draw (saved Manual version 1)');
		expect(
			categoryGroupLabel(categories, { ...decision, categoryId: null, definitionSnapshot: null })
		).toBe('Uncategorized');
	});
	it('keeps different historical origins separate even when their rendered name and version match', () => {
		const otherDecision = {
			...decision,
			categoryId: 'other',
			definitionSnapshot: { ...version, id: 'other-version', originId: 'other-origin' }
		};
		const state = {
			...categories,
			definitions: [
				...categories.definitions,
				{ ...definition, id: 'other', originId: 'other-origin' }
			]
		};
		expect(categoryGroupLabel(state, decision)).toBe(categoryGroupLabel(state, otherDecision));
		expect(categoryGroupIdentity(state, decision)).not.toBe(
			categoryGroupIdentity(state, otherDecision)
		);
	});
	it('identifies overlapping custom rule evidence by its exact definition and frozen label', () => {
		const other = { ...definition, id: 'other', name: 'Other custom' };
		const state = { ...categories, definitions: [other, definition] };
		expect(
			categoryPredicateLabel(
				{
					origin: 'custom',
					definitionId: 'local',
					definitionName: 'Old custom',
					definitionVersion: 1,
					result: 'True',
					matchedTagIds: []
				},
				decision,
				state
			)
		).toBe('Old custom version 1');
		expect(
			categoryPredicateLabel(
				{ origin: 'custom', definitionId: 'other', result: 'False', matchedTagIds: [] },
				decision,
				state
			)
		).toBe('Other custom (current label; saved rule label unavailable)');
		expect(
			categoryPredicateLabel(
				{ origin: 'custom', definitionId: 'local', result: 'True', matchedTagIds: [] },
				decision,
				state
			)
		).toBe('Draw');
	});
});
