import { and, desc, eq } from 'drizzle-orm';
import { mutationFingerprint, RequestConflictError } from './request-fingerprint';
import { db } from '#lib/server/db/client.ts';
import {
	inventories,
	inventoryMutationRequests,
	scanArtifacts,
	scanReviewItems,
	scanSessions
} from '#lib/server/db/schema.ts';
import { applyInventoryMutation, ensureInventory, getInventorySnapshot } from './inventory';
import {
	assertCondition,
	assertFinish,
	assertInventoryOperation,
	assertRequestId,
	ValidationError
} from '#lib/server/mtg/validation.ts';
import { getCatalogPrinting } from '#lib/server/catalog/search.ts';
import type { ScanCandidate, ScanSession, ScanSessionResult, ScanWorkerResult } from './types';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SessionStatus = 'open' | 'pending_review' | 'committed' | 'cancelled';

function normalizeScore(score: number): number {
	if (!Number.isFinite(score)) throw new ValidationError('Scan score must be a finite number');
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
			status: 'open'
		})
		.returning();
	return session;
}

async function lockSession(tx: Tx, accountId: string, sessionId: string) {
	const [session] = await tx
		.select()
		.from(scanSessions)
		.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
		.for('update');
	if (!session) throw new ValidationError('Scan session not found');
	return session;
}

function assertReviewable(session: ScanSession) {
	if (session.status !== 'open' && session.status !== 'pending_review') {
		throw new ValidationError('Scan session is not open for review');
	}
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
	return db.transaction(async (tx) => {
		const session = await lockSession(tx, accountId, input.sessionId);
		if (session.status !== 'open')
			throw new ScanAccessError(409, 'Scan session is not open for uploads');
		const now = new Date();
		const values = {
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
		};
		const [artifact] = await tx
			.insert(scanArtifacts)
			.values({
				...values,
				id: input.artifactId,
				sessionId: input.sessionId,
				accountId,
				createdAt: now
			})
			.onConflictDoUpdate({
				target: scanArtifacts.id,
				set: values,
				setWhere: and(
					eq(scanArtifacts.accountId, accountId),
					eq(scanArtifacts.sessionId, input.sessionId)
				)
			})
			.returning();
		if (!artifact) throw new ValidationError('Scan artifact belongs to another session');
		await tx
			.update(scanSessions)
			.set({ status: 'pending_review', updatedAt: now })
			.where(eq(scanSessions.id, session.id));
		return artifact;
	});
}

export interface ScanReviewInput {
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

async function saveReviewItem(tx: Tx, accountId: string, input: ScanReviewInput) {
	const [artifact] = await tx
		.select()
		.from(scanArtifacts)
		.where(
			and(
				eq(scanArtifacts.id, input.scanArtifactId),
				eq(scanArtifacts.accountId, accountId),
				eq(scanArtifacts.sessionId, input.sessionId)
			)
		)
		.limit(1);
	if (!artifact) throw new ValidationError('Scan artifact not found in this session');
	const operation = reviewAddOperation(input);
	const now = new Date();
	const values = {
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
		finish: assertFinish(input.finish),
		condition: assertCondition(input.condition),
		quantity: operation.quantity,
		updatedAt: now
	};
	const [review] = await tx
		.insert(scanReviewItems)
		.values({
			...values,
			id: input.id,
			sessionId: input.sessionId,
			scanArtifactId: input.scanArtifactId,
			accountId,
			createdAt: now
		})
		.onConflictDoUpdate({
			target: scanReviewItems.id,
			set: values,
			setWhere: and(
				eq(scanReviewItems.accountId, accountId),
				eq(scanReviewItems.sessionId, input.sessionId),
				eq(scanReviewItems.scanArtifactId, input.scanArtifactId)
			)
		})
		.returning();
	if (!review) throw new ValidationError('Scan review item belongs to another artifact or session');
}

function reviewAddOperation(input: ScanReviewInput) {
	const operation = assertInventoryOperation({
		op: 'add',
		card: input,
		finish: input.finish,
		condition: input.condition,
		quantity: input.quantity
	});
	if (operation.op !== 'add') throw new ValidationError('Expected an inventory add');
	return operation;
}

export async function upsertScanReviewItem(accountId: string, input: ScanReviewInput) {
	return db.transaction(async (tx) => {
		const session = await lockSession(tx, accountId, input.sessionId);
		assertReviewable(session);
		await saveReviewItem(tx, accountId, input);
		await tx
			.update(scanSessions)
			.set({ status: 'pending_review', updatedAt: new Date() })
			.where(eq(scanSessions.id, session.id));
		return tx
			.select()
			.from(scanReviewItems)
			.where(
				and(
					eq(scanReviewItems.sessionId, input.sessionId),
					eq(scanReviewItems.accountId, accountId)
				)
			);
	});
}

export async function commitScanReview(
	accountId: string,
	requestId: string,
	sessionId: string,
	items: ScanReviewInput[]
) {
	requestId = assertRequestId(requestId);
	if (items.length === 0) throw new ValidationError('Scan review requires at least one item');
	const operations = items.map(reviewAddOperation);
	const requestHash = mutationFingerprint({
		kind: 'scan_review',
		sessionId,
		artifacts: items.map((item) => item.scanArtifactId),
		operations
	});
	await db.transaction(async (tx) => {
		const session = await lockSession(tx, accountId, sessionId);
		const inventory = await ensureInventory(accountId, session.game, tx);
		await tx
			.select({ id: inventories.id })
			.from(inventories)
			.where(eq(inventories.id, inventory.id))
			.for('update');
		const [existing] = await tx
			.select()
			.from(inventoryMutationRequests)
			.where(
				and(
					eq(inventoryMutationRequests.accountId, accountId),
					eq(inventoryMutationRequests.requestId, requestId)
				)
			)
			.limit(1);
		if (existing) {
			if (existing.requestHash && existing.requestHash !== requestHash)
				throw new RequestConflictError();
			return;
		}
		assertReviewable(session);
		for (const item of items) {
			if (item.sessionId !== sessionId) throw new ValidationError('Scan review session mismatch');
			await saveReviewItem(tx, accountId, item);
		}
		await applyInventoryMutation(
			tx,
			accountId,
			{
				requestId,
				game: session.game,
				source: 'scan_review',
				operations
			},
			requestHash
		);
		await tx
			.update(scanSessions)
			.set({ status: 'committed', updatedAt: new Date() })
			.where(eq(scanSessions.id, session.id));
	});
	return getInventorySnapshot(accountId, 'mtg');
}

export async function updateScanSessionStatus(
	accountId: string,
	sessionId: string,
	status: string
): Promise<ScanSession | null> {
	const statuses: SessionStatus[] = ['open', 'pending_review', 'committed', 'cancelled'];
	if (!statuses.includes(status as SessionStatus))
		throw new ValidationError('Invalid scan session status');
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
					status: lastArtifact.status as ScanWorkerResult['status'],
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

export class ScanAccessError extends Error {
	constructor(
		public status: 404 | 409,
		message: string
	) {
		super(message);
	}
}

export async function listScanSessions(accountId: string): Promise<ScanSession[]> {
	return db
		.select()
		.from(scanSessions)
		.where(eq(scanSessions.accountId, accountId))
		.orderBy(desc(scanSessions.updatedAt))
		.limit(100);
}

export async function getOwnedScanArtifact(
	accountId: string,
	artifactId: string,
	sessionId?: string
) {
	const [row] = await db
		.select({ artifact: scanArtifacts, session: scanSessions })
		.from(scanArtifacts)
		.innerJoin(scanSessions, eq(scanSessions.id, scanArtifacts.sessionId))
		.where(
			and(
				eq(scanArtifacts.id, artifactId),
				eq(scanArtifacts.accountId, accountId),
				eq(scanSessions.accountId, accountId),
				sessionId ? eq(scanArtifacts.sessionId, sessionId) : undefined
			)
		)
		.limit(1);
	if (!row) throw new ScanAccessError(404, 'Scan artifact not found');
	return row;
}

function resultText(value: unknown, field: string, max: number, optional = false): string {
	if (optional && value === undefined) return '';
	if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) {
		throw new ValidationError(
			`${field} must be ${optional ? 'at most' : 'between 1 and'} ${max} characters`
		);
	}
	return value.trim();
}

export async function submitScanResult(
	accountId: string,
	sessionId: string,
	artifactId: string,
	body: unknown
) {
	const owned = await getOwnedScanArtifact(accountId, artifactId, sessionId);
	if (!['open', 'pending_review'].includes(owned.session.status)) {
		throw new ScanAccessError(409, 'Scan session is closed');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body))
		throw new ValidationError('Expected a scan result object');
	const input = body as Record<string, unknown>;
	const statuses: ScanWorkerResult['status'][] = ['matched', 'ambiguous', 'no_match', 'failed'];
	if (!statuses.includes(input.status as ScanWorkerResult['status']))
		throw new ValidationError('Invalid scan result status');
	const status = input.status as ScanWorkerResult['status'];
	const modelVersion = resultText(input.modelVersion, 'modelVersion', 128);
	if (!Array.isArray(input.candidates) || input.candidates.length > 20)
		throw new ValidationError('candidates must contain at most 20 entries');
	if (
		(status === 'matched' && input.candidates.length === 0) ||
		(status === 'ambiguous' && input.candidates.length < 2) ||
		((status === 'no_match' || status === 'failed') && input.candidates.length !== 0)
	) {
		throw new ValidationError('Candidates do not match the scan result status');
	}
	const seen = new Set<string>();
	const candidateInputs = input.candidates.map((value: unknown) => {
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new ValidationError('Invalid scan candidate');
		const candidate = value as Record<string, unknown>;
		const catalogCardId = resultText(candidate.catalogCardId, 'catalogCardId', 36);
		if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(catalogCardId))
			throw new ValidationError('Invalid catalog card ID');
		if (seen.has(catalogCardId.toLowerCase()))
			throw new ValidationError('Duplicate candidate printing');
		seen.add(catalogCardId.toLowerCase());
		if (
			typeof candidate.confidence !== 'number' ||
			!Number.isFinite(candidate.confidence) ||
			candidate.confidence < 0 ||
			candidate.confidence > 1
		) {
			throw new ValidationError('confidence must be a finite number between 0 and 1');
		}
		return {
			catalogCardId,
			confidence: candidate.confidence,
			notes: resultText(candidate.notes, 'notes', 500, true)
		};
	});
	const candidates: ScanCandidate[] = [];
	for (const candidate of candidateInputs) {
		const card = await getCatalogPrinting(candidate.catalogCardId);
		if (
			card.id.toLowerCase() !== candidate.catalogCardId.toLowerCase() ||
			!card.oracle_id ||
			!card.name ||
			!card.set_code ||
			!card.collector_number
		) {
			throw new ValidationError('Catalog printing is incomplete');
		}
		candidates.push({
			catalogCardId: card.id,
			canonicalCardId: card.oracle_id,
			oracleId: card.oracle_id,
			name: card.name,
			setCode: card.set_code,
			collectorNumber: card.collector_number,
			imageUri: card.image_uri,
			similarityScore: Math.round(candidate.confidence * 100),
			ocrScore: 0,
			finalScore: Math.round(candidate.confidence * 100),
			confidence: candidate.confidence,
			matchReason: candidate.notes || 'external_scanner'
		});
	}
	const artifact = await db.transaction(async (tx) => {
		const session = await lockSession(tx, accountId, sessionId);
		if (!['open', 'pending_review'].includes(session.status))
			throw new ScanAccessError(409, 'Scan session is closed');
		const [updated] = await tx
			.update(scanArtifacts)
			.set({
				status,
				embeddingModelVersion: modelVersion,
				candidateJson: candidates,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(scanArtifacts.id, artifactId),
					eq(scanArtifacts.sessionId, sessionId),
					eq(scanArtifacts.accountId, accountId)
				)
			)
			.returning();
		if (!updated) throw new ScanAccessError(404, 'Scan artifact not found');
		await tx
			.update(scanSessions)
			.set({ status: 'pending_review', updatedAt: new Date() })
			.where(eq(scanSessions.id, sessionId));
		return updated;
	});
	const result: ScanWorkerResult = {
		status,
		normalizedObjectKey: artifact.normalizedObjectKey,
		qualityScore: artifact.qualityScore,
		embeddingModelVersion: artifact.embeddingModelVersion,
		ocrModelVersion: artifact.ocrModelVersion,
		ocrTokens: {
			name: artifact.ocrName ?? undefined,
			setCode: artifact.ocrSetCode ?? undefined,
			collectorNumber: artifact.ocrCollectorNumber ?? undefined
		},
		candidates
	};
	return { artifact, result };
}
