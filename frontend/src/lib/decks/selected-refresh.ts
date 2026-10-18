import type { Deck, DeckSnapshot, LegalityWarning } from '@spellbook/contracts/decks.ts';
import type { DeckEntryCategories } from '@spellbook/contracts/categories.ts';
import type { DeckWholeCategories } from '@spellbook/contracts/whole-categories.ts';
import type { CardDocument } from '#lib/search/types.ts';
import type { ReadLease } from '#lib/saved-state/workspace.ts';

// The narrow projection is still the complete coherent selected snapshot.
export type SelectedDeckNarrowDTO = DeckSnapshot;
export type SelectedDeckLegality = {
	warnings: LegalityWarning[];
	deckDocuments: Record<string, CardDocument>;
};
export type SelectedDeckFullDTO = SelectedDeckNarrowDTO & SelectedDeckLegality;
type Ownership = DeckSnapshot['ownedPrintings'];
type Search = { hits: CardDocument[]; ownedByCanonical: Record<string, number> };
export type SelectedDeckContext = {
	accountId: string;
	deckId: string | null;
	flow: string;
	/** Immediate route identity, independent of scheduled effects. */
	scope: object;
	inspector: { canonicalCardId: string; opening: number } | null;
	search: { query: string; opening: number } | null;
};
type Phase = 'snapshot' | 'categories' | 'whole-categories' | 'ownership' | 'search';
export class SelectedDeckReadError extends Error {
	constructor(
		readonly phase: Phase,
		cause: unknown
	) {
		super(
			`${phase}: ${cause instanceof Error ? cause.message : 'Saved changes could not be loaded.'}`,
			{
				cause
			}
		);
	}
	get deckUnavailable() {
		return (
			this.phase === 'snapshot' &&
			this.cause instanceof Error &&
			this.cause.message === 'This saved target is no longer available.'
		);
	}
}
export type SelectedDeckFields = {
	name: string;
	nameBase: string;
	format: string;
	formatBase: string;
	description: string;
	descriptionBase: string;
	descriptionRevision: string;
};
export type SelectedInspectorFields = {
	entryId: string;
	opening: number;
	quantity: number;
	quantityBase: number;
	role: string;
	roleBase: string;
};
export type SelectedDeckMergeState = {
	confirmedDecks: readonly Deck[];
	categories: DeckEntryCategories | null | undefined;
	wholeCategories: DeckWholeCategories | null | undefined;
	details: SelectedDeckFields | null;
	inspector: SelectedInspectorFields | null;
};
export type SelectedDeckPublication = {
	snapshot: SelectedDeckNarrowDTO;
	optionalLegality?: SelectedDeckLegality;
	categories?: DeckEntryCategories;
	wholeCategories?: DeckWholeCategories;
	ownership?: Ownership;
	search?: Search;
	details?: Partial<SelectedDeckFields>;
	inspector?: Partial<SelectedInspectorFields>;
};
export type SelectedDeckRefreshInput = {
	lease: ReadLease;
	context(): SelectedDeckContext;
	read<T>(path: string, lease: ReadLease): Promise<T | null>;
	/** Reads the route's live state. No draft or receipt is retained by this module. */
	state(): SelectedDeckMergeState;
	/** One synchronous publication, after every read and final guard. */
	publish(value: SelectedDeckPublication): void;
};
function sameInspector(a: SelectedDeckContext['inspector'], b: SelectedDeckContext['inspector']) {
	return a?.canonicalCardId === b?.canonicalCardId && a?.opening === b?.opening;
}
function sameSearch(a: SelectedDeckContext['search'], b: SelectedDeckContext['search']) {
	return a?.query === b?.query && a?.opening === b?.opening;
}
function older(candidate: string, confirmed: string) {
	return !!confirmed && BigInt(candidate) < BigInt(confirmed);
}

/** Workspace owns scheduling; this attempt stages all reads before touching route state. */
export async function refreshSelectedDeck(input: SelectedDeckRefreshInput): Promise<void | false> {
	const { lease, read } = input;
	const activeContext = input.context();
	const context = {
		...activeContext,
		inspector: activeContext.inspector && { ...activeContext.inspector },
		search: activeContext.search && { ...activeContext.search }
	};
	const current = () => {
		const next = input.context();
		return (
			!lease.signal.aborted &&
			lease.current() &&
			next.scope === context.scope &&
			next.accountId === context.accountId &&
			next.deckId === context.deckId &&
			next.flow === context.flow
		);
	};
	if (!current()) return false;
	if (!context.deckId) return;
	const initial = input.state();
	const cause = lease.cause;
	const full = !cause || cause === 'full';
	const has = (topic: 'decks' | 'inventory' | 'values') => full || cause.includes(topic);
	const categoriesNeeded = has('decks') || has('values');
	const ownershipNeeded = !!context.inspector && has('inventory');
	const searchNeeded = !!context.search && (has('inventory') || has('values'));
	const guarded = { signal: lease.signal, current };
	async function stage<T>(phase: Phase, path: string, relevant = () => true): Promise<T | null> {
		const active = () => current() && relevant();
		if (!active()) return null;
		try {
			const result = await read<T>(path, { ...guarded, current: active });
			return active() ? result : null;
		} catch (cause) {
			if (!active()) return null;
			throw new SelectedDeckReadError(phase, cause);
		}
	}
	const base = `/api/mobile/v1/mtg/decks/${encodeURIComponent(context.deckId)}`;
	let snapshot: SelectedDeckNarrowDTO | null;
	let optionalLegality: SelectedDeckLegality | undefined;
	if (categoriesNeeded) {
		const result = await stage<SelectedDeckFullDTO>('snapshot', `${base}?selectedOnly=true`);
		if (!result || !current()) return false;
		const { warnings, deckDocuments, ...core } = result;
		snapshot = core;
		optionalLegality = { warnings, deckDocuments };
	} else {
		snapshot = await stage<SelectedDeckNarrowDTO>(
			'snapshot',
			`${base}?selectedOnly=true&includeLegality=false`
		);
	}
	if (!snapshot || !current()) return false;
	const selected = snapshot.decks.find((deck) => deck.id === context.deckId);
	if (!selected) return false;
	let categories: DeckEntryCategories | undefined, wholeCategories: DeckWholeCategories | undefined;
	if (categoriesNeeded) {
		const entries = await stage<DeckEntryCategories>('categories', `${base}/categories`);
		if (!entries || !current()) return false;
		categories = entries;
		const whole = await stage<DeckWholeCategories>('whole-categories', `${base}/whole-categories`);
		if (!whole || !current()) return false;
		wholeCategories = whole;
	}
	const inspectorCurrent = () => sameInspector(context.inspector, input.context().inspector);
	const searchCurrent = () => sameSearch(context.search, input.context().search);
	let ownership: Ownership | null = null,
		search: Search | null = null;
	if (ownershipNeeded && context.inspector) {
		ownership = await stage<Ownership>(
			'ownership',
			`/api/mobile/v1/mtg/decks/ownership?canonicalCardId=${encodeURIComponent(context.inspector.canonicalCardId)}`,
			inspectorCurrent
		);
		if (!current() || (!ownership && inspectorCurrent())) return false;
	}
	if (searchNeeded && context.search) {
		search = await stage<Search>(
			'search',
			`/api/mobile/v1/mtg/decks/search?q=${encodeURIComponent(context.search.query)}`,
			searchCurrent
		);
		if (!current() || (!search && searchCurrent())) return false;
	}
	// No await after this point. Read current confirmed bases and dirty fields now.
	if (!current()) return false;
	const latest = input.state();
	if (
		latest.confirmedDecks.some(
			(deck) =>
				deck.id === selected.id &&
				(older(selected.compositionRevision, deck.compositionRevision) ||
					older(selected.descriptionRevision, deck.descriptionRevision))
		)
	)
		return false;
	if (
		categories &&
		(categories.deckId !== selected.id ||
			(latest.categories && older(categories.decisionRevision, latest.categories.decisionRevision)))
	)
		return false;
	if (
		wholeCategories &&
		(wholeCategories.deckId !== selected.id ||
			(latest.wholeCategories &&
				older(wholeCategories.decisionRevision, latest.wholeCategories.decisionRevision)))
	)
		return false;
	const details: Partial<SelectedDeckFields> = {};
	if (latest.details) {
		const fields = latest.details;
		if (older(selected.descriptionRevision, fields.descriptionRevision)) return false;
		for (const key of ['name', 'format', 'description'] as const) {
			const base =
				key === 'name' ? 'nameBase' : key === 'format' ? 'formatBase' : 'descriptionBase';
			if (
				initial.details &&
				fields[base] !== initial.details[base] &&
				selected[key] !== fields[base]
			)
				return false;
			if (fields[key] === fields[base]) {
				details[key] = selected[key];
				details[base] = selected[key];
				if (key === 'description') details.descriptionRevision = selected.descriptionRevision;
			}
		}
	}
	const inspector: Partial<SelectedInspectorFields> = {};
	if (latest.inspector && inspectorCurrent()) {
		const fields = latest.inspector;
		const entry = snapshot.deckCards.find((entry) => entry.id === fields.entryId);
		if (entry) {
			for (const key of ['quantity', 'role'] as const) {
				if (key === 'quantity') {
					if (
						initial.inspector?.opening === fields.opening &&
						fields.quantityBase !== initial.inspector.quantityBase &&
						entry.quantity !== fields.quantityBase
					)
						return false;
					if (fields.quantity === fields.quantityBase)
						inspector.quantity = inspector.quantityBase = entry.quantity;
				} else {
					if (
						initial.inspector?.opening === fields.opening &&
						fields.roleBase !== initial.inspector.roleBase &&
						entry.role !== fields.roleBase
					)
						return false;
					if (fields.role === fields.roleBase) inspector.role = inspector.roleBase = entry.role;
				}
			}
		}
	}
	if (!current()) return false;
	input.publish({
		snapshot,
		optionalLegality,
		categories,
		wholeCategories,
		details,
		inspector,
		ownership: ownership && inspectorCurrent() ? ownership : undefined,
		search: search && searchCurrent() ? search : undefined
	});
}
