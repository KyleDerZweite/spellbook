import { and, eq } from 'drizzle-orm';
import type { ScanCommitApplication } from '@spellbook/contracts/scan.ts';
import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type { Database } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { scanSessions, scanArtifacts, scanReviewItems } from '../db/schema.ts';
import {
	assertRequestId,
	assertFinish,
	assertCondition,
	assertBoundedText,
	assertUuid,
	positiveQuantity,
	normalizeQuantity,
	ValidationError
} from '../mtg/validation.ts';
import { mutationFingerprint } from '../decks/request-fingerprint.ts';
import {
	createInventoryWriter,
	InventoryNotFoundError,
	type InventoryIntent
} from '../inventory/mutations.ts';
/** Exact actor-authorized legacy commit bridge; upload/storage/read contracts remain slice7. */
export function createScanCommit(
	db: Database,
	catalog: CatalogApplication,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
): ScanCommitApplication {
	const writer = createInventoryWriter(db, catalog, auth);
	return {
		commitReview: async (actor, input) => {
			const sessionId = assertUuid(input.sessionId, 'sessionId');
			if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100)
				throw new ValidationError('Supply 1 to 100 Scan review items');
			const score = (value: unknown) => {
				if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100)
					throw new ValidationError('Scan scores must be integers from zero to 100');
				return value;
			};
			const items = input.items.map((item) => {
				if (!item || typeof item !== 'object' || Array.isArray(item))
					throw new ValidationError('Invalid Scan review item');
				if (assertUuid(item.sessionId, 'sessionId') !== sessionId)
					throw new ValidationError('Scan review session mismatch');
				return {
					...(item.id === undefined ? {} : { id: assertUuid(item.id, 'id') }),
					sessionId,
					scanArtifactId: assertUuid(item.scanArtifactId, 'scanArtifactId'),
					catalogCardId: assertUuid(item.catalogCardId, 'catalogCardId'),
					similarityScore: score(item.similarityScore),
					ocrScore: score(item.ocrScore),
					finalScore: score(item.finalScore),
					matchReason: assertBoundedText(item.matchReason, 'matchReason', 500),
					finish: assertFinish(item.finish),
					condition: assertCondition(item.condition),
					quantity: positiveQuantity(item.quantity)
				};
			});
			const intent: InventoryIntent = {
				requestId: assertRequestId(input.requestId),
				source: 'scan_review',
				operations: items.map((item) => ({
					op: 'add',
					catalogCardId: item.catalogCardId,
					finish: item.finish,
					condition: item.condition,
					quantity: item.quantity
				}))
			};
			const hash = mutationFingerprint({
				kind: 'scan_review',
				scan: { sessionId, items },
				source: intent.source,
				operations: intent.operations
			});
			const prepared = await writer.prepare(actor, intent, hash);
			if (prepared.kind === 'Recorded') return prepared.acknowledgement;
			return db.transaction(async (tx) => {
				await writer.authorize(tx, prepared.mutation);
				const recorded = await writer.replay(tx, prepared.mutation);
				if (recorded) return recorded;
				const { accountId, printings } = prepared.mutation;
				const [session] = await tx
					.select()
					.from(scanSessions)
					.where(and(eq(scanSessions.id, sessionId), eq(scanSessions.accountId, accountId)))
					.for('update');
				if (!session) throw new InventoryNotFoundError('Scan session not found');
				if (!['open', 'pending_review'].includes(session.status))
					throw new ValidationError('Scan session is not open for review');
				const acknowledgement = await writer.apply(tx, prepared.mutation);
				for (const item of items) {
					const [artifact] = await tx
						.select({ id: scanArtifacts.id })
						.from(scanArtifacts)
						.where(
							and(
								eq(scanArtifacts.id, item.scanArtifactId),
								eq(scanArtifacts.accountId, accountId),
								eq(scanArtifacts.sessionId, sessionId)
							)
						)
						.limit(1);
					if (!artifact)
						throw new InventoryNotFoundError('Scan artifact not found in this session');
					const printing = printings.get(item.catalogCardId)!;
					const values = {
						catalogCardId: printing.id,
						canonicalCardId: printing.oracle_id,
						oracleId: printing.oracle_id,
						name: printing.name,
						setCode: printing.set_code,
						collectorNumber: printing.collector_number,
						imageUri: printing.image_uri,
						similarityScore: item.similarityScore,
						ocrScore: item.ocrScore,
						finalScore: item.finalScore,
						matchReason: item.matchReason,
						finish: item.finish,
						condition: item.condition,
						quantity: item.quantity,
						updatedAt: new Date()
					};
					const [review] = await tx
						.insert(scanReviewItems)
						.values({
							...values,
							id: item.id ?? crypto.randomUUID(),
							sessionId: sessionId,
							scanArtifactId: item.scanArtifactId,
							accountId
						})
						.onConflictDoUpdate({
							target: scanReviewItems.id,
							set: values,
							setWhere: and(
								eq(scanReviewItems.accountId, accountId),
								eq(scanReviewItems.sessionId, sessionId),
								eq(scanReviewItems.scanArtifactId, item.scanArtifactId)
							)
						})
						.returning({ id: scanReviewItems.id });
					if (!review)
						throw new ValidationError('Scan review belongs to another artifact or session');
				}
				await tx
					.update(scanSessions)
					.set({ status: 'committed', updatedAt: new Date() })
					.where(eq(scanSessions.id, sessionId));
				await writer.recordReceipt(tx, prepared.mutation, acknowledgement);
				return acknowledgement;
			});
		}
	};
}
