import type { AuthUser } from './auth.ts';
export interface InventoryQuery {
	q: string;
	sets: string[];
	finish: 'all' | 'foil' | 'nonfoil';
	condition: 'all' | 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
	sort: 'name' | 'set' | 'newest';
	dir: 'asc' | 'desc';
	variant: 'finish' | 'condition' | 'quantity' | null;
	variantDir: 'asc' | 'desc';
	view: 'cards' | 'groups';
	group: string | null;
	offset: number;
	limit: number;
}
export interface InventoryEntry {
	id: string;
	accountId: string;
	inventoryId: string;
	game: string;
	catalogCardId: string;
	canonicalCardId: string;
	name: string;
	setCode: string;
	imageUri: string;
	quantity: number;
	finish: string;
	condition: string;
	notes: string;
	notesRevision: string;
	spellbookPosition: number;
	createdAt: string;
	updatedAt: string;
}
export interface InventoryGroupCount {
	id: string;
	name: string;
	entryCount: number;
	quantity: number;
}
export interface InventoryTotals {
	entryCount: number;
	copyCount: number;
	canonicalCardCount: number;
	foilEntryCount: number;
	setCount: number;
}
export interface RevisionChanged {
	kind: 'RevisionChanged';
	revision: string;
}
export interface InventoryPage {
	kind: 'Page';
	query: InventoryQuery;
	queryKey: string;
	revision: string;
	entries: InventoryEntry[];
	memberships: Array<{ entryId: string; groupId: string }>;
	groups: InventoryGroupCount[];
	groupPage: InventoryGroupCount[];
	groupCount: number;
	matching: { entryCount: number; copyCount: number };
	totals: InventoryTotals;
	sets: Array<{ code: string; name: string }>;
	setProgress: {
		setCode: string;
		ownedCanonicalCount: number;
		catalogCanonicalCount: number;
	} | null;
	viewedAt: string;
}
export interface InventoryEntryDetail {
	entry: InventoryEntry;
	memberships: string[];
	revision: string;
}
export interface InventoryLocation {
	kind: 'Location';
	revision: string;
	index: number | null;
}
export interface InventoryApplication {
	page(
		actor: AuthUser,
		input: unknown,
		expectedRevision?: string
	): Promise<InventoryPage | RevisionChanged>;
	getEntry(actor: AuthUser, entryId: string): Promise<InventoryEntryDetail | null>;
	locate(
		actor: AuthUser,
		input: unknown,
		entryId: string,
		expectedRevision: string
	): Promise<InventoryLocation | RevisionChanged>;
}
