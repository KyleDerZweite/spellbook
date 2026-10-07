import type { DeckCard } from '@spellbook/contracts/decks.ts';
import { describe, it, expect } from 'vitest';
import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
import {
	initialCategoryDraft,
	editCategoryDraft,
	acknowledgeCategoryDraft,
	reconcileCategoryDraft,
	categoryEditorEntries,
	categoryEditorUnavailable
} from '../../src/lib/decks/category-save.ts';
const saved: DeckEntryCategories = {
	deckId: 'deck',
	initialized: true,
	decisionRevision: '4',
	definitions: [],
	decisions: [
		{ entryId: 'entry', categoryId: 'draw', state: 'Automatic', revision: '1', evidence: null }
	],
	sourceStatus: { kind: 'Succeeded', sourceTime: null }
};
describe('confirmed category saves and independent current reads', () => {
	it('retains the confirmed selection when the following page refresh fails, then reconciles a successful current read', () => {
		const initial = initialCategoryDraft(saved.decisions[0], saved.decisionRevision);
		const submitted = editCategoryDraft(initial, 'ramp');
		const confirmed = acknowledgeCategoryDraft(submitted, 'ramp', {
			deckId: 'deck',
			requestId: 'request',
			decisionRevision: '5',
			entryIds: ['entry']
		});
		const failedRefresh = reconcileCategoryDraft(confirmed, saved, 'entry');
		expect(failedRefresh).toMatchObject({ value: 'ramp', revision: '5', dirty: true });
		const current: DeckEntryCategories = {
			...saved,
			decisionRevision: '5',
			decisions: [{ ...saved.decisions[0], categoryId: 'ramp', state: 'Manual', revision: '2' }]
		};
		expect(reconcileCategoryDraft(failedRefresh, current, 'entry')).toMatchObject({
			value: 'ramp',
			revision: '5',
			dirty: false,
			confirmation: null
		});
	});
	it('retains a new local choice typed while the earlier save and refresh complete', () => {
		const submitted = editCategoryDraft(initialCategoryDraft(saved.decisions[0], '4'), 'ramp');
		const newer = editCategoryDraft(submitted, '');
		const confirmed = acknowledgeCategoryDraft(newer, 'ramp', {
			deckId: 'deck',
			requestId: 'request',
			decisionRevision: '5',
			entryIds: ['entry']
		});
		const current: DeckEntryCategories = {
			...saved,
			decisionRevision: '5',
			decisions: [{ ...saved.decisions[0], categoryId: 'ramp', state: 'Manual' }]
		};
		expect(reconcileCategoryDraft(confirmed, current, 'entry')).toMatchObject({
			value: '',
			revision: '5',
			dirty: true
		});
	});
});

it('reads the bounded category endpoint without navigating, rejects an unavailable read, and forwards cancellation', async () => {
	const { readCategorySnapshot } = await import('../../src/lib/decks/category-save.ts');
	const controller = new AbortController();
	let seen = '';
	let signal: AbortSignal | null | undefined;
	const fetcher: typeof fetch = async (input, options) => {
		seen = String(input);
		signal = options?.signal;
		return new Response('Unavailable', { status: 500 });
	};
	await expect(readCategorySnapshot(fetcher, 'owned-deck', controller.signal)).rejects.toThrow(
		'Could not read the saved category'
	);
	expect(seen).toBe('/api/mobile/v1/mtg/decks/owned-deck/categories');
	expect(signal).toBe(controller.signal);
	const current = await readCategorySnapshot(
		async () => Response.json(saved),
		'deck',
		controller.signal
	);
	expect(current).toEqual(saved);
});

it('publishes recovered source health from a successful equal-revision read without changing saved decisions', async () => {
	const { selectCategorySnapshot } = await import('../../src/lib/decks/category-save.ts');
	const failed: DeckEntryCategories = {
		...saved,
		sourceStatus: { kind: 'Failed', sourceTime: null }
	};
	const recovered: DeckEntryCategories = {
		...saved,
		sourceStatus: { kind: 'Succeeded', sourceTime: '2026-10-06' }
	};
	expect(selectCategorySnapshot(failed, recovered)).toBe(recovered);
	expect(selectCategorySnapshot(failed, recovered)?.decisions).toBe(saved.decisions);
	expect(selectCategorySnapshot(failed, { ...recovered, decisionRevision: '3' })).toBe(failed);
});

it('retains dirty entry-owned category editors across saved role changes and removal without changing Main grouping', () => {
	const main: Pick<DeckCard, 'id' | 'name' | 'role'> = {
		id: 'entry',
		name: 'Sol Ring',
		role: 'main'
	};
	let rows = categoryEditorEntries([], [main], []);
	const dirty = editCategoryDraft(
		initialCategoryDraft(saved.decisions[0], saved.decisionRevision),
		'ramp'
	);
	const moved: typeof main = { ...main, role: 'sideboard' };
	rows = categoryEditorEntries(rows, [moved], ['entry']);
	expect(rows).toEqual([{ id: 'entry', name: 'Sol Ring' }]);
	expect(categoryEditorUnavailable('entry', [moved], false)).toMatch(/outside Main/);
	expect([moved].filter((entry) => entry.role === 'main')).toEqual([]);
	expect(reconcileCategoryDraft(dirty, { ...saved, decisionRevision: '5' }, 'entry')).toBe(dirty);
	rows = categoryEditorEntries(rows, [], ['entry']);
	expect(rows).toHaveLength(1);
	expect(categoryEditorUnavailable('entry', [], false)).toMatch(/removed/);
	expect(
		reconcileCategoryDraft(dirty, { ...saved, decisionRevision: '6', decisions: [] }, 'entry')
	).toBe(dirty);
	expect(categoryEditorEntries(rows, [], [])).toEqual([]);
});
