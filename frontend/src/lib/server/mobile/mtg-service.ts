import type { MobileAuthContext } from './types';
import { application } from '#lib/server/composition.ts';
import {
	addDeckCard,
	bulkMutateDeckCards as bulkMutateDeckCardsData,
	createDeck,
	deleteDeck,
	getDeckCardsForDeck,
	getDeckSnapshot,
	removeDeckCard,
	updateDeck,
	updateDeckCard
} from '#lib/server/data/decks.ts';
import {
	DECK_SOURCES,
	INVENTORY_SOURCES,
	assertRequestId,
	normalizeSource
} from '#lib/server/mtg/validation.ts';
import {
	createScanSession,
	getScanSessionResult,
	recordScanArtifact,
	updateScanSessionStatus,
	upsertScanReviewItem
} from '#lib/server/data/scan.ts';
import type { ScanCandidate } from '#lib/server/data/types.ts';

export async function batchAddInventory(
	auth: MobileAuthContext,
	input: {
		requestId: string;
		source: string;
		items: Array<
			Pick<
				import('@spellbook/contracts/inventory.ts').InventoryAdd,
				'catalogCardId' | 'finish' | 'condition' | 'quantity' | 'notes' | 'notesRevision'
			>
		>;
	}
) {
	return application.inventory.bulk(auth.user, {
		requestId: input.requestId,
		source: normalizeSource(input.source, INVENTORY_SOURCES, 'mobile'),
		operations: input.items.map((item) => ({ op: 'add', ...item }))
	});
}
export async function bulkMutateInventory(
	auth: MobileAuthContext,
	input: { requestId: string; source: string; operations: unknown }
) {
	return application.inventory.bulk(auth.user, {
		requestId: input.requestId,
		source: normalizeSource(input.source, INVENTORY_SOURCES, 'mobile'),
		operations: Array.isArray(input.operations) ? input.operations : []
	});
}
export const updateInventoryEntry = (
	auth: MobileAuthContext,
	input: import('@spellbook/contracts/inventory.ts').InventoryPatch
) => application.inventory.patchEntry(auth.user, input);
export const removeInventoryEntry = (
	auth: MobileAuthContext,
	input: import('@spellbook/contracts/inventory.ts').InventoryRemove
) => application.inventory.remove(auth.user, input);

export async function getDeckSnapshotEntry(auth: MobileAuthContext, deckId: string | null = null) {
	return getDeckSnapshot(auth.user, 'mtg', deckId);
}

export async function createDeckEntry(
	auth: MobileAuthContext,
	input: { name: string; description: string; format: string }
) {
	return createDeck(auth.user, {
		game: 'mtg',
		name: input.name,
		description: input.description,
		format: input.format
	});
}

export async function updateDeckEntry(
	auth: MobileAuthContext,
	input: import('@spellbook/contracts/decks.ts').DeckPatch
) {
	return updateDeck(auth.user, input);
}

export async function deleteDeckEntry(auth: MobileAuthContext, deckId: string) {
	await deleteDeck(auth.user, deckId);
	return { ok: true };
}

export async function addDeckCardEntry(
	auth: MobileAuthContext,
	input: {
		deckId: string;
		catalogCardId: string;
		canonicalCardId: string;
		name: string;
		setCode: string;
		imageUri: string;
		quantity: number;
		role: string;
		requestId: string;
	}
) {
	return addDeckCard(auth.user, input);
}

export async function bulkMutateDeckCards(
	auth: MobileAuthContext,
	input: {
		deckId: string;
		requestId: string;
		source: string;
		operations: unknown;
	}
) {
	const operations = Array.isArray(input.operations) ? input.operations : [];
	return bulkMutateDeckCardsData(auth.user, {
		deckId: input.deckId,
		requestId: assertRequestId(input.requestId),
		source: normalizeSource(input.source, DECK_SOURCES, 'mobile'),
		game: 'mtg',
		operations: operations as import('@spellbook/contracts/decks.ts').DeckOperation[]
	});
}

export async function getDeckCardsEntry(auth: MobileAuthContext, deckId: string) {
	return getDeckCardsForDeck(auth.user, deckId);
}

export async function updateDeckCardEntry(
	auth: MobileAuthContext,
	entryId: string,
	quantity: number | undefined,
	role: string | undefined,
	requestId: string,
	delta?: number
) {
	return updateDeckCard(auth.user, entryId, quantity, role, requestId, delta, 'mobile');
}

export async function removeDeckCardEntry(
	auth: MobileAuthContext,
	entryId: string,
	requestId: string
) {
	return removeDeckCard(auth.user, entryId, requestId, 'mobile');
}

export async function createScanSessionEntry(
	auth: MobileAuthContext,
	sessionId = crypto.randomUUID()
) {
	return createScanSession(auth.user.accountId, 'mtg', sessionId);
}

export async function recordScanArtifactEntry(
	auth: MobileAuthContext,
	input: {
		artifactId: string;
		sessionId: string;
		originalObjectKey: string;
		normalizedObjectKey: string;
		qualityScore: number;
		embeddingModelVersion: string;
		ocrModelVersion: string;
		status: string;
		ocrName?: string;
		ocrSetCode?: string;
		ocrCollectorNumber?: string;
		candidateJson: ScanCandidate[] | string;
	}
) {
	const candidates =
		typeof input.candidateJson === 'string'
			? (JSON.parse(input.candidateJson || '[]') as ScanCandidate[])
			: input.candidateJson;

	return recordScanArtifact(auth.user.accountId, {
		...input,
		candidateJson: candidates
	});
}

export async function upsertScanReviewItemEntry(
	auth: MobileAuthContext,
	input: {
		id: string;
		sessionId: string;
		scanArtifactId: string;
		catalogCardId: string;
		canonicalCardId: string;
		oracleId: string;
		name: string;
		setCode: string;
		collectorNumber: string;
		imageUri: string;
		similarityScore: number;
		ocrScore: number;
		finalScore: number;
		matchReason: string;
		finish: string;
		condition: string;
		quantity: number;
	}
) {
	return upsertScanReviewItem(auth.user.accountId, input);
}

export async function updateScanSessionStatusEntry(
	auth: MobileAuthContext,
	sessionId: string,
	status: string
) {
	return updateScanSessionStatus(auth.user.accountId, sessionId, status);
}

export async function getScanSessionResultEntry(auth: MobileAuthContext, sessionId: string) {
	return getScanSessionResult(auth.user.accountId, sessionId);
}
