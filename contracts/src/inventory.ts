import type { AuthUser } from './auth.ts';
import type { ImportPreview } from './decks.ts';
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
export interface InventoryReadApplication {
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

export type InventorySource = 'mobile' | 'web' | 'import' | 'scan' | 'scan_review';
export interface InventoryAcknowledgement {
	requestId: string;
	inventoryId: string | null;
	revision: string;
	changes: Array<{
		entryId: string;
		catalogCardId: string;
		finish: string;
		condition: string;
		quantity: number;
		delta: number;
		notesRevision: string;
	}>;
	removedEntryIds: string[];
	groups: Array<{ groupId: string; name?: string }>;
	removedGroupIds: string[];
	memberships: Array<{ entryId: string; groupIds: string[] }>;
	import?: { resolvedCount: number; unresolvedCount: number; ambiguousCount: number };
	legacy?: true;
}
export interface InventoryAdd {
	requestId: string;
	catalogCardId: string;
	finish: string;
	condition: string;
	quantity: number;
	source?: InventorySource;
	notes?: string;
	notesRevision?: string;
}
export interface InventoryPatch {
	requestId: string;
	entryId: string;
	quantity?: number;
	delta?: number;
	notes?: string;
	notesRevision?: string;
	source?: InventorySource;
}
export interface InventoryRemove {
	requestId: string;
	entryId: string;
	expectedQuantity: number;
	source?: InventorySource;
}
export interface InventoryBulkInput {
	requestId: string;
	source?: InventorySource;
	game?: 'mtg';
	operations: unknown[];
}
export interface InventoryScanReviewInput {
	id?: string;
	sessionId: string;
	scanArtifactId: string;
	catalogCardId: string;
	canonicalCardId?: string;
	oracleId?: string;
	name?: string;
	setCode?: string;
	collectorNumber?: string;
	imageUri?: string;
	similarityScore: number;
	ocrScore: number;
	finalScore: number;
	matchReason: string;
	finish: string;
	condition: string;
	quantity: number;
}
export interface InventoryMutationApplication {
	previewImport(actor: AuthUser, text: string): Promise<ImportPreview>;
	commitImport(
		actor: AuthUser,
		input: {
			requestId: string;
			text: string;
			defaultFinish?: string;
			defaultCondition?: string;
			source?: InventorySource;
		}
	): Promise<InventoryAcknowledgement>;
	commitScanReview(
		actor: AuthUser,
		input: { requestId: string; sessionId: string; items: InventoryScanReviewInput[] }
	): Promise<InventoryAcknowledgement>;

	add(actor: AuthUser, input: InventoryAdd): Promise<InventoryAcknowledgement>;
	patchEntry(actor: AuthUser, input: InventoryPatch): Promise<InventoryAcknowledgement>;
	remove(actor: AuthUser, input: InventoryRemove): Promise<InventoryAcknowledgement>;
	bulk(actor: AuthUser, input: InventoryBulkInput): Promise<InventoryAcknowledgement>;
	createGroup(
		actor: AuthUser,
		input: { requestId: string; name: string }
	): Promise<InventoryAcknowledgement>;
	renameGroup(
		actor: AuthUser,
		input: { requestId: string; groupId: string; name: string }
	): Promise<InventoryAcknowledgement>;
	deleteGroup(
		actor: AuthUser,
		input: { requestId: string; groupId: string }
	): Promise<InventoryAcknowledgement>;
	replaceMemberships(
		actor: AuthUser,
		input: { requestId: string; entryId: string; groupIds: string[] }
	): Promise<InventoryAcknowledgement>;
	reorder(
		actor: AuthUser,
		input: { requestId: string; entryId: string; position: number }
	): Promise<InventoryAcknowledgement>;
}
export interface InventoryApplication
	extends InventoryReadApplication, InventoryMutationApplication {}
