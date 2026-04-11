import { DbConnection } from '$bindings';
import type {
	Deck,
	DeckCard,
	Inventory,
	InventoryCard,
	InventoryMutationRequest,
	ScanArtifact,
	ScanReviewItem,
	ScanSession,
	UserProfile
} from '$bindings/types';
import { publicEnv } from '$lib/env/public';
import type { MobileAuthContext, MobileInventoryBatchItem } from './types';

type AnyConnection = InstanceType<typeof DbConnection>;

interface UserConnectionContext {
	conn: AnyConnection;
}

function sqlEscape(value: string): string {
	return value.replaceAll("'", "''");
}

function getQueries(accountId: string): string[] {
	const escaped = sqlEscape(accountId);
	return [
		`SELECT * FROM inventory WHERE owner_id = '${escaped}'`,
		`SELECT * FROM inventory_card WHERE owner_id = '${escaped}'`,
		`SELECT * FROM deck WHERE owner_id = '${escaped}'`,
		`SELECT * FROM deck_card WHERE owner_id = '${escaped}'`,
		`SELECT * FROM user_profile WHERE account_id = '${escaped}'`,
		`SELECT * FROM scan_session WHERE owner_id = '${escaped}'`,
		`SELECT * FROM scan_artifact WHERE owner_id = '${escaped}'`,
		`SELECT * FROM scan_review_item WHERE owner_id = '${escaped}'`,
		`SELECT * FROM inventory_mutation_request WHERE owner_id = '${escaped}'`
	];
}

export async function withUserConnection<T>(
	auth: MobileAuthContext,
	run: (ctx: UserConnectionContext) => Promise<T>
): Promise<T> {
	return await new Promise<T>((resolve, reject) => {
		let settled = false;
		let connected: AnyConnection | null = null;

		const finish = (callback: () => void) => {
			if (settled) {
				return;
			}

			settled = true;
			callback();
			connected?.disconnect();
		};

		connected = DbConnection.builder()
			.withUri(publicEnv.PUBLIC_SPACETIMEDB_URL)
			.withDatabaseName(publicEnv.PUBLIC_SPACETIMEDB_MODULE)
			.withToken(auth.token)
			.onConnect((conn) => {
				conn
					.subscriptionBuilder()
					.onApplied(async () => {
						try {
							const result = await run({ conn });
							finish(() => resolve(result));
						} catch (err) {
							finish(() => reject(err));
						}
					})
					.onError((err) => {
						finish(() => reject(err));
					})
					.subscribe(getQueries(auth.user.accountId));
			})
			.onConnectError((_conn, err) => {
				finish(() => reject(err));
			})
			.onDisconnect((_ctx, err) => {
				if (!settled && err) {
					finish(() => reject(err));
				}
			})
			.build();
	});
}

function snapshotFromConnection(conn: AnyConnection) {
	return {
		inventories: [...conn.db.inventory.iter()] as Inventory[],
		inventoryCards: [...conn.db.inventoryCard.iter()] as InventoryCard[],
		decks: [...conn.db.deck.iter()] as Deck[],
		deckCards: [...conn.db.deckCard.iter()] as DeckCard[],
		userProfiles: [...conn.db.userProfile.iter()] as UserProfile[],
		scanSessions: [...conn.db.scanSession.iter()] as ScanSession[],
		scanArtifacts: [...conn.db.scanArtifact.iter()] as ScanArtifact[],
		scanReviewItems: [...conn.db.scanReviewItem.iter()] as ScanReviewItem[],
		inventoryMutationRequests: [
			...conn.db.inventoryMutationRequest.iter()
		] as InventoryMutationRequest[]
	};
}

export async function getInventorySnapshot(auth: MobileAuthContext) {
	return withUserConnection(auth, async ({ conn }) => {
		const snapshot = snapshotFromConnection(conn);
		const inventory = snapshot.inventories.find((entry) => entry.game === 'mtg') ?? null;
		const cards = inventory
			? snapshot.inventoryCards.filter((card) => card.inventoryId === inventory.id)
			: [];
		return {
			inventory,
			cards,
			stats: {
				total: cards.reduce((sum, card) => sum + card.quantity, 0),
				unique: new Set(cards.map((card) => card.canonicalCardId)).size,
				sets: new Set(cards.map((card) => card.setCode)).size
			},
			mutationRequests: snapshot.inventoryMutationRequests
		};
	});
}

export async function batchAddInventory(
	auth: MobileAuthContext,
	input: {
		requestId: string;
		source: string;
		items: MobileInventoryBatchItem[];
	}
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.batchAddToInventory({
			requestId: input.requestId,
			source: input.source,
			game: 'mtg',
			items: input.items.map((item) => ({
				...item,
				quantity: Math.max(1, Math.trunc(item.quantity))
			}))
		});

		const snapshot = snapshotFromConnection(conn);
		return {
			inventory: snapshot.inventories.find((entry) => entry.game === 'mtg') ?? null,
			cards: snapshot.inventoryCards
		};
	});
}

export async function updateInventoryEntry(
	auth: MobileAuthContext,
	entryId: string,
	quantity: number,
	notes = ''
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.updateInventoryCard({
			entryId,
			quantity: Math.max(1, Math.trunc(quantity)),
			notes
		});

		return (
			snapshotFromConnection(conn).inventoryCards.find((card) => card.entryId === entryId) ?? null
		);
	});
}

export async function removeInventoryEntry(auth: MobileAuthContext, entryId: string) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.removeFromInventory({ entryId });
		return { ok: true };
	});
}

export async function getDeckSnapshot(auth: MobileAuthContext) {
	return withUserConnection(auth, async ({ conn }) => {
		const snapshot = snapshotFromConnection(conn);
		return {
			decks: snapshot.decks.filter((deck) => deck.game === 'mtg'),
			deckCards: snapshot.deckCards
		};
	});
}

export async function createDeckEntry(
	auth: MobileAuthContext,
	input: { name: string; description: string; format: string }
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.createDeck({
			game: 'mtg',
			name: input.name,
			description: input.description,
			format: input.format
		});
		return snapshotFromConnection(conn).decks.filter((deck) => deck.game === 'mtg');
	});
}

export async function updateDeckEntry(
	auth: MobileAuthContext,
	input: { deckId: string; name: string; description: string; format: string }
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.updateDeck(input);
		return snapshotFromConnection(conn).decks.find((deck) => deck.id === input.deckId) ?? null;
	});
}

export async function deleteDeckEntry(auth: MobileAuthContext, deckId: string) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.deleteDeck({ deckId });
		return { ok: true };
	});
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
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.addToDeck({
			...input,
			quantity: Math.max(1, Math.trunc(input.quantity))
		});
		return snapshotFromConnection(conn).deckCards.filter((card) => card.deckId === input.deckId);
	});
}

export async function updateDeckCardEntry(
	auth: MobileAuthContext,
	entryId: string,
	quantity: number
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.updateDeckCard({
			entryId,
			quantity: Math.max(1, Math.trunc(quantity))
		});
		return snapshotFromConnection(conn).deckCards.find((card) => card.entryId === entryId) ?? null;
	});
}

export async function removeDeckCardEntry(auth: MobileAuthContext, entryId: string) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.removeFromDeck({ entryId });
		return { ok: true };
	});
}

export async function createScanSessionEntry(auth: MobileAuthContext, sessionId: string) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.createScanSession({
			sessionId,
			game: 'mtg'
		});
		return (
			snapshotFromConnection(conn).scanSessions.find((session) => session.id === sessionId) ?? null
		);
	});
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
		candidateJson: string;
	}
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.recordScanArtifact({
			artifactId: input.artifactId,
			sessionId: input.sessionId,
			originalObjectKey: input.originalObjectKey,
			normalizedObjectKey: input.normalizedObjectKey,
			embeddingModelVersion: input.embeddingModelVersion,
			ocrModelVersion: input.ocrModelVersion,
			status: input.status,
			candidateJson: input.candidateJson,
			qualityScore: Math.max(0, Math.trunc(input.qualityScore)),
			ocrName: input.ocrName,
			ocrSetCode: input.ocrSetCode,
			ocrCollectorNumber: input.ocrCollectorNumber
		});
		return (
			snapshotFromConnection(conn).scanArtifacts.find(
				(artifact) => artifact.id === input.artifactId
			) ?? null
		);
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
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.upsertScanReviewItem({
			...input,
			quantity: Math.max(1, Math.trunc(input.quantity)),
			similarityScore: Math.max(0, Math.trunc(input.similarityScore)),
			ocrScore: Math.max(0, Math.trunc(input.ocrScore)),
			finalScore: Math.max(0, Math.trunc(input.finalScore))
		});
		return snapshotFromConnection(conn).scanReviewItems.filter(
			(item) => item.sessionId === input.sessionId
		);
	});
}

export async function updateScanSessionStatusEntry(
	auth: MobileAuthContext,
	sessionId: string,
	status: string
) {
	return withUserConnection(auth, async ({ conn }) => {
		await conn.reducers.updateScanSessionStatus({
			sessionId,
			status
		});
		return (
			snapshotFromConnection(conn).scanSessions.find((session) => session.id === sessionId) ?? null
		);
	});
}

export async function getScanSessionResult(auth: MobileAuthContext, sessionId: string) {
	return withUserConnection(auth, async ({ conn }) => {
		const snapshot = snapshotFromConnection(conn);
		const session = snapshot.scanSessions.find((entry) => entry.id === sessionId) ?? null;
		const artifacts = snapshot.scanArtifacts.filter((entry) => entry.sessionId === sessionId);
		const reviewItems = snapshot.scanReviewItems.filter((entry) => entry.sessionId === sessionId);
		const lastArtifact = [...artifacts].sort(
			(a, b) => Number(b.updatedAt) - Number(a.updatedAt)
		)[0];
		return {
			session,
			artifacts,
			reviewItems,
			lastResult: lastArtifact
				? {
						status: lastArtifact.status as 'matched' | 'ambiguous' | 'no_match',
						normalizedObjectKey: lastArtifact.normalizedObjectKey,
						qualityScore: Number(lastArtifact.qualityScore),
						embeddingModelVersion: lastArtifact.embeddingModelVersion,
						ocrModelVersion: lastArtifact.ocrModelVersion,
						ocrTokens: {
							name: lastArtifact.ocrName ?? undefined,
							setCode: lastArtifact.ocrSetCode ?? undefined,
							collectorNumber: lastArtifact.ocrCollectorNumber ?? undefined
						},
						candidates: JSON.parse(lastArtifact.candidateJson || '[]')
					}
				: null
		};
	});
}
