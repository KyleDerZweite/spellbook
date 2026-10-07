import type { DeckCard } from '@spellbook/contracts/decks.ts';
import type {
	CategoryAcknowledgement,
	DeckEntryCategories,
	EntryCategoryDecision
} from '@spellbook/contracts/categories.ts';
export type CategoryDraft = {
	value: string;
	revision: string;
	dirty: boolean;
	confirmation: { categoryId: string | null; revision: string } | null;
};
export function initialCategoryDraft(
	decision: EntryCategoryDecision | undefined,
	revision: string,
	recovery?: { categoryId: string | null; expectedDecisionRevision: string }
): CategoryDraft {
	return {
		value: recovery ? (recovery.categoryId ?? '') : (decision?.categoryId ?? ''),
		revision: recovery?.expectedDecisionRevision ?? revision,
		dirty: !!recovery,
		confirmation: null
	};
}
export function editCategoryDraft(state: CategoryDraft, value: string): CategoryDraft {
	return { ...state, value, dirty: true };
}
export function acknowledgeCategoryDraft(
	state: CategoryDraft,
	submitted: string,
	ack: CategoryAcknowledgement
): CategoryDraft {
	return {
		...state,
		dirty: true,
		revision: ack.decisionRevision,
		confirmation: { categoryId: submitted || null, revision: ack.decisionRevision }
	};
}
export function reconcileCategoryDraft(
	state: CategoryDraft,
	read: DeckEntryCategories,
	entryId: string
): CategoryDraft {
	if (BigInt(read.decisionRevision) < BigInt(state.revision)) return state;
	const decision = read.decisions.find((d) => d.entryId === entryId);
	const value = decision?.categoryId ?? '';
	if (
		state.confirmation &&
		decision?.state === 'Manual' &&
		decision.categoryId === state.confirmation.categoryId &&
		state.value === value &&
		BigInt(read.decisionRevision) >= BigInt(state.confirmation.revision)
	) {
		return { ...state, value, revision: read.decisionRevision, dirty: false, confirmation: null };
	}
	if (state.dirty) return state;
	return value === state.value && read.decisionRevision === state.revision
		? state
		: { ...state, value, revision: read.decisionRevision };
}

/** Read only the owned category snapshot; failures never replace the mounted Deck page. */
export async function readCategorySnapshot(
	fetcher: typeof fetch,
	deckId: string,
	signal: AbortSignal
): Promise<DeckEntryCategories> {
	const response = await fetcher(
		`/api/mobile/v1/mtg/decks/${encodeURIComponent(deckId)}/categories`,
		{
			signal,
			headers: { accept: 'application/json' },
			cache: 'no-store'
		}
	);
	if (!response.ok) throw new Error('Could not read the saved category. Your choice is retained.');
	const read: DeckEntryCategories = await response.json();
	if (read.deckId !== deckId)
		throw new Error('Could not read the saved category. Your choice is retained.');
	return read;
}

export function selectCategorySnapshot(
	server: DeckEntryCategories | null | undefined,
	current: DeckEntryCategories | null
): DeckEntryCategories | null | undefined {
	return current && (!server || BigInt(current.decisionRevision) >= BigInt(server.decisionRevision))
		? current
		: server;
}

export type CategoryEditorEntry = Pick<DeckCard, 'id' | 'name'>;
/** Editor identity is separate from Main-only category grouping. */
export function categoryEditorEntries(
	previous: readonly CategoryEditorEntry[],
	entries: readonly Pick<DeckCard, 'id' | 'name' | 'role'>[],
	dirtyEntryIds: readonly string[]
): CategoryEditorEntry[] {
	const current = entries
		.filter((entry) => entry.role === 'main')
		.map(({ id, name }) => ({ id, name }));
	const ids = new Set(current.map((entry) => entry.id));
	return [
		...current,
		...previous.filter((entry) => dirtyEntryIds.includes(entry.id) && !ids.has(entry.id))
	];
}
export function categoryEditorUnavailable(
	entryId: string,
	entries: readonly Pick<DeckCard, 'id' | 'role'>[],
	deletedDeck: boolean
): string | null {
	if (deletedDeck)
		return 'This Deck was removed. Your category draft is retained and cannot be saved.';
	const entry = entries.find((value) => value.id === entryId);
	if (!entry) return 'This entry was removed. Your category draft is retained and cannot be saved.';
	return entry.role !== 'main'
		? 'This entry moved outside Main. Your category draft is retained and cannot be saved here.'
		: null;
}
