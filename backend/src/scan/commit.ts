import { and, eq } from 'drizzle-orm';
import type {
	ScanCommitInput,
	ScanCommitAcknowledgement,
	ScanReviewIntent
} from '@spellbook/contracts/scan.ts';
import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type { InventoryAcknowledgement } from '@spellbook/contracts/inventory.ts';
import type { Database, Transaction } from '../db/client.ts';
import {
	scanSessions,
	scanArtifacts,
	scanReviewItems,
	inventoryMutationRequests
} from '../db/schema.ts';
import {
	assertRequestId,
	assertBoundedText,
	assertFinish,
	assertCondition,
	assertUuid,
	assertInventoryOperation,
	positiveQuantity,
	ValidationError
} from '../mtg/validation.ts';
import { mutationFingerprint, RequestConflictError } from '../decks/request-fingerprint.ts';
import { createInventoryWriter, type InventoryIntent } from '../inventory/mutations.ts';
import { authorizeScan, lockScanSession, assertReviewable, type ScanAuth } from './access.ts';
import { candidateArray, record, text, score, ScanError } from './validation.ts';

function normalize(value: unknown): ScanReviewIntent {
	const item = record(value);
	return {
		...(item.id === undefined ? {} : { id: assertUuid(item.id, 'id') }),
		scanArtifactId: assertUuid(item.scanArtifactId, 'scanArtifactId'),
		catalogCardId: assertUuid(item.catalogCardId, 'catalogCardId'),
		finish: assertFinish(item.finish),
		condition: assertCondition(item.condition),
		quantity: positiveQuantity(item.quantity)
	};
}
function intentFields(item: ScanReviewIntent) {
	return {
		scanArtifactId: item.scanArtifactId,
		catalogCardId: item.catalogCardId,
		finish: item.finish,
		condition: item.condition,
		quantity: item.quantity
	};
}
function legacyHash(input: ScanCommitInput, items: ScanReviewIntent[]): string | undefined {
	const evidence = input.legacyVerification;
	if (evidence === undefined) return;
	if (
		!evidence ||
		!['scan-v1', 'scan-v2'].includes(evidence.version) ||
		!Array.isArray(evidence.items) ||
		evidence.items.length !== items.length
	)
		throw new ValidationError('Invalid legacy Scan verification evidence');
	const sessionId = evidence.sessionId ?? input.sessionId;
	if (assertUuid(sessionId, 'legacy sessionId') !== assertUuid(input.sessionId, 'sessionId'))
		throw new RequestConflictError();
	for (const [index, value] of evidence.items.entries()) {
		if (
			assertUuid(value.sessionId, 'sessionId') !== assertUuid(input.sessionId, 'sessionId') ||
			mutationFingerprint(intentFields(normalize(value))) !==
				mutationFingerprint(intentFields(items[index]))
		)
			throw new RequestConflictError();
	}
	if (evidence.version === 'scan-v1') {
		const operations = evidence.items.map((value) =>
			assertInventoryOperation({
				op: 'add',
				card: value,
				finish: value.finish,
				condition: value.condition,
				quantity: value.quantity
			})
		);
		for (const operation of operations)
			if (operation.op === 'add') {
				text(operation.card.name, 'legacy name', 500);
				text(operation.card.catalogCardId, 'legacy catalogCardId', 36);
				text(operation.card.canonicalCardId, 'legacy canonicalCardId', 36);
				text(operation.card.setCode, 'legacy setCode', 100, true);
				text(operation.card.imageUri, 'legacy imageUri', 2000, true);
			}
		return mutationFingerprint({
			kind: 'scan_review',
			sessionId,
			artifacts: evidence.items.map((i) => i.scanArtifactId),
			operations
		});
	}
	const normalized = evidence.items.map((value) => ({
		...(value.id === undefined ? {} : { id: assertUuid(value.id, 'id') }),
		sessionId: assertUuid(value.sessionId, 'sessionId'),
		scanArtifactId: assertUuid(value.scanArtifactId, 'scanArtifactId'),
		catalogCardId: assertUuid(value.catalogCardId, 'catalogCardId'),
		similarityScore: legacyScore(value.similarityScore),
		ocrScore: legacyScore(value.ocrScore),
		finalScore: legacyScore(value.finalScore),
		matchReason: assertBoundedText(value.matchReason, 'matchReason', 500),
		finish: assertFinish(value.finish),
		condition: assertCondition(value.condition),
		quantity: positiveQuantity(value.quantity)
	}));
	return mutationFingerprint({
		kind: 'scan_review',
		scan: { sessionId: assertUuid(sessionId, 'sessionId'), items: normalized },
		source: 'scan_review',
		operations: normalized.map((item) => ({
			op: 'add',
			catalogCardId: item.catalogCardId,
			finish: item.finish,
			condition: item.condition,
			quantity: item.quantity
		}))
	});
}
function legacyScore(value: unknown) {
	const result = score(value);
	if (result > 100) throw new ValidationError('Legacy Scan scores must be from zero to 100');
	return result;
}
function noRepeat(requestId: string): InventoryAcknowledgement {
	return {
		requestId,
		inventoryId: null,
		revision: '0',
		changes: [],
		removedEntryIds: [],
		groups: [],
		removedGroupIds: [],
		memberships: [],
		legacy: true
	};
}
export function createScanCommit(db: Database, catalog: CatalogApplication, auth: ScanAuth) {
	const writer = createInventoryWriter(db, catalog, auth);
	return {
		async commitReview(
			actor: import('@spellbook/contracts/auth.ts').AuthUser,
			input: ScanCommitInput,
			signal?: AbortSignal
		): Promise<ScanCommitAcknowledgement> {
			signal?.throwIfAborted();
			const user = await auth.requireActor(actor);
			const requestId = assertRequestId(input.requestId);
			if (requestId.length > 256) throw new ValidationError('requestId exceeds 256 characters');
			const sessionId = assertUuid(input.sessionId, 'sessionId');
			if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100)
				throw new ValidationError('Supply 1 to 100 Scan review items');
			const items = input.items.map(normalize);
			const identities = new Set<string>();
			const reviewIds = new Set<string>();
			for (const item of items) {
				const identity = mutationFingerprint(intentFields({ ...item, quantity: 1 }));
				if (identities.has(identity) || (item.id && reviewIds.has(item.id)))
					throw new ValidationError('Duplicate Scan review identity');
				identities.add(identity);
				if (item.id) reviewIds.add(item.id);
			}
			const hash =
				'scan-intent-v3:' +
				mutationFingerprint({
					version: 'scan-intent-v3',
					kind: 'scan_review',
					sessionId,
					items: items.map(intentFields)
				});
			const historicalHash = legacyHash(input, items);
			async function probe(
				executor: Database | Transaction,
				accountId: string
			): Promise<ScanCommitAcknowledgement | null> {
				const [receipt] = await executor
					.select()
					.from(inventoryMutationRequests)
					.where(
						and(
							eq(inventoryMutationRequests.accountId, accountId),
							eq(inventoryMutationRequests.requestId, requestId)
						)
					)
					.limit(1);
				if (!receipt) return null;
				if (receipt.source !== 'scan_review') throw new RequestConflictError();
				if (receipt.requestHash === null)
					return {
						kind: 'LegacyNoRepeat',
						requestId,
						binding: 'UnverifiedLegacyHash',
						acknowledgement: receipt.acknowledgement ?? noRepeat(requestId)
					};
				if (receipt.requestHash !== hash && receipt.requestHash !== historicalHash) {
					if (receipt.requestHash.startsWith('scan-intent-v3:')) throw new RequestConflictError();
					if (!historicalHash)
						throw new ScanError(
							'LegacyReplayEvidenceRequired',
							'Original Scan retry evidence is required for this request.',
							409
						);
					throw new RequestConflictError();
				}
				if (!receipt.acknowledgement)
					return {
						kind: 'LegacyNoRepeat',
						requestId,
						binding: 'VerifiedLegacyHash',
						acknowledgement: noRepeat(requestId)
					};
				return {
					kind: 'Committed',
					sessionId,
					acknowledgement: receipt.acknowledgement
				};
			}
			async function authorizedReplay() {
				return db.transaction(async (tx) => {
					const current = await authorizeScan(tx, actor, auth);
					return probe(tx, current.accountId);
				});
			}
			// The early probe avoids Catalog reads, but never returns authority outside the locked prefix.
			if (await probe(db, user.accountId)) {
				const replay = await authorizedReplay();
				if (replay) return replay;
			}
			const intent: InventoryIntent = {
				requestId,
				source: 'scan_review',
				operations: items.map((item) => ({
					op: 'add',
					catalogCardId: item.catalogCardId,
					finish: item.finish,
					condition: item.condition,
					quantity: item.quantity
				}))
			};
			let prepared: Awaited<ReturnType<typeof writer.prepare>>;
			try {
				prepared = await writer.prepare(actor, intent, hash);
			} catch (cause) {
				if (cause instanceof RequestConflictError) {
					const replay = await authorizedReplay();
					if (replay) return replay;
				}
				throw cause;
			}
			if (prepared.kind === 'Recorded') {
				const replay = await authorizedReplay();
				if (replay) return replay;
				throw new RequestConflictError();
			}
			const mutation = prepared.mutation;
			return db.transaction(async (tx) => {
				await writer.authorize(tx, mutation);
				const replay = await probe(tx, mutation.accountId);
				if (replay) return replay;
				const session = await lockScanSession(tx, mutation.accountId, sessionId);
				assertReviewable(session.status);
				signal?.throwIfAborted();
				for (const item of items) {
					const [artifact] = await tx
						.select()
						.from(scanArtifacts)
						.where(
							and(
								eq(scanArtifacts.id, item.scanArtifactId),
								eq(scanArtifacts.accountId, mutation.accountId),
								eq(scanArtifacts.sessionId, sessionId)
							)
						)
						.limit(1);
					if (!artifact)
						throw new ScanError('ScanNotFound', 'Scan artifact not found in this session', 404);
					if (item.id) {
						const [existing] = await tx
							.select()
							.from(scanReviewItems)
							.where(eq(scanReviewItems.id, item.id))
							.limit(1);
						if (
							existing &&
							(existing.accountId !== mutation.accountId ||
								existing.sessionId !== sessionId ||
								existing.scanArtifactId !== item.scanArtifactId)
						)
							throw new ValidationError('Scan review belongs to another artifact or session');
					}
					const printing = mutation.printings.get(item.catalogCardId)!;
					const candidate = candidateArray(artifact.candidateJson).find(
						(c) => c.catalogCardId === item.catalogCardId
					);
					const values = {
						catalogCardId: printing.id,
						canonicalCardId: printing.oracle_id,
						oracleId: printing.oracle_id,
						name: printing.name,
						setCode: printing.set_code,
						collectorNumber: printing.collector_number,
						imageUri: printing.image_uri,
						similarityScore: candidate?.similarityScore ?? 0,
						ocrScore: candidate?.ocrScore ?? 0,
						finalScore: candidate?.finalScore ?? 0,
						matchReason: candidate?.matchReason ?? 'manual_review',
						finish: item.finish,
						condition: item.condition,
						quantity: item.quantity,
						updatedAt: new Date()
					};
					const [saved] = await tx
						.insert(scanReviewItems)
						.values({
							...values,
							id: item.id ?? crypto.randomUUID(),
							sessionId,
							scanArtifactId: item.scanArtifactId,
							accountId: mutation.accountId
						})
						.onConflictDoUpdate({
							target: scanReviewItems.id,
							set: values,
							setWhere: and(
								eq(scanReviewItems.accountId, mutation.accountId),
								eq(scanReviewItems.sessionId, sessionId),
								eq(scanReviewItems.scanArtifactId, item.scanArtifactId)
							)
						})
						.returning({ id: scanReviewItems.id });
					if (!saved)
						throw new ValidationError('Scan review belongs to another artifact or session');
				}
				const acknowledgement = await writer.apply(tx, mutation);
				await tx
					.update(scanSessions)
					.set({ status: 'committed', updatedAt: new Date() })
					.where(eq(scanSessions.id, sessionId));
				await writer.recordReceipt(tx, mutation, acknowledgement);
				signal?.throwIfAborted();
				return { kind: 'Committed' as const, sessionId, acknowledgement };
			});
		}
	};
}
