import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { scanArtifacts, scanReviewItems, scanSessions } from '$lib/server/db/schema';
import type { ScanCandidate, ScanSession, ScanSessionResult } from './types';

function normalizeQuantity(quantity: number): number {
	return Math.max(1, Math.trunc(quantity));
}

function normalizeScore(score: number): number {
	return Math.max(0, Math.trunc(score));
}

export async function createScanSession(
	accountId: string,
	game = 'mtg',
	sessionId = crypto.randomUUID()
): Promise<ScanSession> {
	const [session] = await db
		.insert(scanSessions)
		.values({
			id: sessionId,
			accountId,
			game,
			status: 'pending_upload'
		})
		.returning();

	return session;
}

export async function recordScanArtifact(
	accountId: string,
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
		candidateJson: ScanCandidate[];
	}
) {
	const [session] = await db
		.select()
		.from(scanSessions)
		.where(and(eq(scanSessions.id, input.sessionId), eq(scanSessions.accountId, accountId)))
		.limit(1);

	if (!session) {
		throw new Error(`Scan session not found: ${input.sessionId}`);
	}

	const now = new Date();
	const [artifact] = await db
		.insert(scanArtifacts)
		.values({
			id: input.artifactId,
			sessionId: input.sessionId,
			accountId,
			originalObjectKey: input.originalObjectKey,
			normalizedObjectKey: input.normalizedObjectKey,
			qualityScore: normalizeScore(input.qualityScore),
			embeddingModelVersion: input.embeddingModelVersion,
			ocrModelVersion: input.ocrModelVersion,
			status: input.status,
			ocrName: input.ocrName,
			ocrSetCode: input.ocrSetCode,
			ocrCollectorNumber: input.ocrCollectorNumber,
			candidateJson: input.candidateJson,
			createdAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: scanArtifacts.id,
			set: {
				originalObjectKey: input.originalObjectKey,
				normalizedObjectKey: input.normalizedObjectKey,
				qualityScore: normalizeScore(input.qualityScore),
				embeddingModelVersion: input.embeddingModelVersion,
				ocrModelVersion: input.ocrModelVersion,
				status: input.status,
				ocrName: input.ocrName,
				ocrSetCode: input.ocrSetCode,
				ocrCollectorNumber: input.ocrCollectorNumber,
				candidateJson: input.candidateJson,
				updatedAt: now
			}
		})
		.returning();

	await updateScanSessionStatus(accountId, input.sessionId, input.status);
	return artifact;
}

export async function upsertScanReviewItem(
	accountId: string,
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
	const [artifact] = await db
		.select()
		.from(scanArtifacts)
		.where(and(eq(scanArtifacts.id, input.scanArtifactId), eq(scanArtifacts.accountId, accountId)))
		.limit(1);

	if (!artifact) {
		throw new Error(`Scan artifact not found: ${input.scanArtifactId}`);
	}

	const now = new Date();
	const values = {
		id: input.id,
		sessionId: input.sessionId,
		scanArtifactId: input.scanArtifactId,
		accountId,
		catalogCardId: input.catalogCardId,
		canonicalCardId: input.canonicalCardId,
		oracleId: input.oracleId,
		name: input.name,
		setCode: input.setCode,
		collectorNumber: input.collectorNumber,
		imageUri: input.imageUri,
		similarityScore: normalizeScore(input.similarityScore),
		ocrScore: normalizeScore(input.ocrScore),
		finalScore: normalizeScore(input.finalScore),
		matchReason: input.matchReason,
		finish: input.finish,
		condition: input.condition,
		quantity: normalizeQuantity(input.quantity),
		updatedAt: now
	};

	await db
		.insert(scanReviewItems)
		.values({ ...values, createdAt: now })
		.onConflictDoUpdate({
			target: scanReviewItems.id,
			set: values
		});

	await updateScanSessionStatus(accountId, input.sessionId, 'pending_review');

	return db
		.select()
		.from(scanReviewItems)
		.where(
			and(eq(scanReviewItems.sessionId, input.sessionId), eq(scanReviewItems.accountId, accountId))
		);
}

export async function updateScanSessionStatus(
	accountId: string,
	sessionId: string,
	status: string
): Promise<ScanSession | null> {
	const [session] = await db
		.update(scanSessions)
		.set({ status, updatedAt: new Date() })
		.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
		.returning();

	return session ?? null;
}

export async function getScanSessionResult(
	accountId: string,
	sessionId: string
): Promise<ScanSessionResult> {
	const [[session], artifacts, reviewItems] = await Promise.all([
		db
			.select()
			.from(scanSessions)
			.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
			.limit(1),
		db
			.select()
			.from(scanArtifacts)
			.where(and(eq(scanArtifacts.sessionId, sessionId), eq(scanArtifacts.accountId, accountId)))
			.orderBy(desc(scanArtifacts.updatedAt)),
		db
			.select()
			.from(scanReviewItems)
			.where(
				and(eq(scanReviewItems.sessionId, sessionId), eq(scanReviewItems.accountId, accountId))
			)
	]);

	const lastArtifact = artifacts[0];

	return {
		session: session ?? null,
		artifacts,
		reviewItems,
		lastResult: lastArtifact
			? {
					status: lastArtifact.status as 'matched' | 'ambiguous' | 'no_match',
					normalizedObjectKey: lastArtifact.normalizedObjectKey,
					qualityScore: lastArtifact.qualityScore,
					embeddingModelVersion: lastArtifact.embeddingModelVersion,
					ocrModelVersion: lastArtifact.ocrModelVersion,
					ocrTokens: {
						name: lastArtifact.ocrName ?? undefined,
						setCode: lastArtifact.ocrSetCode ?? undefined,
						collectorNumber: lastArtifact.ocrCollectorNumber ?? undefined
					},
					candidates: lastArtifact.candidateJson as ScanCandidate[]
				}
			: null
	};
}
