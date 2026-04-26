import type { MobileAuthContext, MobileInventoryBatchItem } from './types';
import {
	batchAddInventory as batchAddInventoryData,
	getInventorySnapshot,
	removeInventoryCard,
	updateInventoryCard
} from '$lib/server/data/inventory';
import {
	addDeckCard,
	createDeck,
	deleteDeck,
	getDeckSnapshot,
	removeDeckCard,
	updateDeck,
	updateDeckCard
} from '$lib/server/data/decks';
import {
	createScanSession,
	getScanSessionResult,
	recordScanArtifact,
	updateScanSessionStatus,
	upsertScanReviewItem
} from '$lib/server/data/scan';
import type { ScanCandidate } from '$lib/server/data/types';

export async function getInventorySnapshotEntry(auth: MobileAuthContext) {
	return getInventorySnapshot(auth.user.accountId, 'mtg');
}

export async function batchAddInventory(
	auth: MobileAuthContext,
	input: {
		requestId: string;
		source: string;
		items: MobileInventoryBatchItem[];
	}
) {
	return batchAddInventoryData(
		auth.user.accountId,
		input.requestId,
		input.source,
		'mtg',
		input.items
	);
}

export async function updateInventoryEntry(
	auth: MobileAuthContext,
	entryId: string,
	quantity: number,
	notes = ''
) {
	return updateInventoryCard(auth.user.accountId, entryId, quantity, notes);
}

export async function removeInventoryEntry(auth: MobileAuthContext, entryId: string) {
	await removeInventoryCard(auth.user.accountId, entryId);
	return { ok: true };
}

export async function getDeckSnapshotEntry(auth: MobileAuthContext) {
	return getDeckSnapshot(auth.user.accountId, 'mtg');
}

export async function createDeckEntry(
	auth: MobileAuthContext,
	input: { name: string; description: string; format: string }
) {
	return createDeck(auth.user.accountId, {
		game: 'mtg',
		name: input.name,
		description: input.description,
		format: input.format
	});
}

export async function updateDeckEntry(
	auth: MobileAuthContext,
	input: { deckId: string; name: string; description: string; format: string }
) {
	return updateDeck(auth.user.accountId, input);
}

export async function deleteDeckEntry(auth: MobileAuthContext, deckId: string) {
	await deleteDeck(auth.user.accountId, deckId);
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
	}
) {
	return addDeckCard(auth.user.accountId, input);
}

export async function updateDeckCardEntry(
	auth: MobileAuthContext,
	entryId: string,
	quantity: number
) {
	return updateDeckCard(auth.user.accountId, entryId, quantity);
}

export async function removeDeckCardEntry(auth: MobileAuthContext, entryId: string) {
	await removeDeckCard(auth.user.accountId, entryId);
	return { ok: true };
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
