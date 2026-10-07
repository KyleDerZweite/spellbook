import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { CatalogApplication } from '@spellbook/contracts/catalog.ts';
import type {
	ScanApplication,
	ScanArtifact,
	ScanResult,
	ScanStatus,
	ScanCandidate
} from '@spellbook/contracts/scan.ts';
import type { Database } from '../db/client.ts';
import * as schema from '../db/schema.ts';
import { scanSessions, scanArtifacts } from '../db/schema.ts';
import { assertUuid, ValidationError } from '../mtg/validation.ts';
import { createScanCommit } from './commit.ts';
import { createScanReader, artifactDto, resultDto, sessionDto } from './read.ts';
import {
	authorizeScan,
	lockScanSession,
	ownedSession,
	assertOpen,
	assertReviewable,
	type ScanAuth
} from './access.ts';
import { checkImage, record, score, status, text, ScanError } from './validation.ts';
import { createScanStorage, type StorageConfiguration } from './storage.ts';
import { processScanArtifact } from './worker.ts';
export interface ScanConfiguration extends StorageConfiguration {
	workerUrl?: string;
}
export function createScan(
	db: Database,
	pool: Pool,
	catalog: CatalogApplication,
	auth: ScanAuth,
	config: ScanConfiguration
) {
	const storage = createScanStorage(config);
	const reader = createScanReader(db, auth);
	const commit = createScanCommit(db, catalog, auth);
	async function artifact(accountId: string, artifactId: string, sessionId?: string) {
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
		if (!row) throw new ScanError('ScanNotFound', 'Scan artifact not found', 404);
		return row;
	}
	const application: ScanApplication = {
		...reader,
		...commit,
		async createSession(actor) {
			return db.transaction(async (tx) => {
				const user = await authorizeScan(tx, actor, auth);
				const [row] = await tx
					.insert(scanSessions)
					.values({
						id: crypto.randomUUID(),
						accountId: user.accountId,
						game: 'mtg',
						status: 'open'
					})
					.returning();
				return sessionDto(row);
			});
		},
		async assertUploadable(actor, sessionId) {
			const user = await auth.requireActor(actor);
			assertOpen(
				(await ownedSession(db, user.accountId, assertUuid(sessionId, 'sessionId'))).status
			);
		},
		async submitResult(actor, input) {
			const sessionId = assertUuid(input.sessionId, 'sessionId'),
				artifactId = assertUuid(input.artifactId, 'artifactId');
			const user = await auth.requireActor(actor);
			assertReviewable((await artifact(user.accountId, artifactId, sessionId)).session.status);
			const value = record(input);
			const modelVersion = text(value.modelVersion, 'modelVersion', 128);
			if (!Array.isArray(value.candidates) || value.candidates.length > 20)
				throw new ValidationError('Supply at most 20 Scan candidates');
			const resultStatus = status(value.status, value.candidates.length);
			const seen = new Set<string>();
			const candidates: ScanCandidate[] = [];
			for (const candidate of value.candidates) {
				const c = record(candidate),
					id = assertUuid(c.catalogCardId, 'catalogCardId');
				if (seen.has(id)) throw new ValidationError('Duplicate candidate printing');
				seen.add(id);
				if (
					typeof c.confidence !== 'number' ||
					!Number.isFinite(c.confidence) ||
					c.confidence < 0 ||
					c.confidence > 1
				)
					throw new ValidationError('confidence must be a finite number between 0 and 1');
				const notes = text(c.notes, 'notes', 500, true);
				const card = await catalog.getCatalogPrinting(id);
				if (card.id.toLowerCase() !== id || !card.name || !card.set_code || !card.collector_number)
					throw new ValidationError('Catalog printing is incomplete');
				assertUuid(card.oracle_id, 'oracleId');
				candidates.push({
					catalogCardId: card.id,
					canonicalCardId: card.oracle_id,
					oracleId: card.oracle_id,
					name: card.name,
					setCode: card.set_code,
					collectorNumber: card.collector_number,
					imageUri: card.image_uri,
					similarityScore: Math.round(c.confidence * 100),
					ocrScore: 0,
					finalScore: Math.round(c.confidence * 100),
					confidence: c.confidence,
					matchReason: notes || 'external_scanner'
				});
			}
			return db.transaction(async (tx) => {
				const current = await authorizeScan(tx, actor, auth);
				const session = await lockScanSession(tx, current.accountId, sessionId);
				assertReviewable(session.status);
				const [row] = await tx
					.update(scanArtifacts)
					.set({
						status: resultStatus,
						embeddingModelVersion: modelVersion,
						candidateJson: candidates,
						updatedAt: new Date()
					})
					.where(
						and(
							eq(scanArtifacts.id, artifactId),
							eq(scanArtifacts.sessionId, sessionId),
							eq(scanArtifacts.accountId, current.accountId)
						)
					)
					.returning();
				if (!row) throw new ScanError('ScanNotFound', 'Scan artifact not found', 404);
				await tx
					.update(scanSessions)
					.set({ status: 'pending_review', updatedAt: new Date() })
					.where(eq(scanSessions.id, sessionId));
				return { artifact: artifactDto(row), result: resultDto(row) };
			});
		}
	};
	function guarded<Args extends unknown[], Result>(method: (...args: Args) => Promise<Result>) {
		return async (...args: Args): Promise<Result> => {
			try {
				return await method(...args);
			} catch (cause) {
				if (
					cause instanceof ScanError ||
					cause instanceof ValidationError ||
					(cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated')
				)
					throw cause;
				throw new ScanError('ScanUnavailable', 'Scan temporarily unavailable. Try again.', 503);
			}
		};
	}
	return {
		...application,
		createSession: guarded(application.createSession),
		assertUploadable: guarded(application.assertUploadable),
		submitResult: guarded(application.submitResult),
		async commitReview(
			actor: AuthUser,
			input: import('@spellbook/contracts/scan.ts').ScanCommitInput,
			signal?: AbortSignal
		) {
			try {
				return await commit.commitReview(actor, input, signal);
			} catch (cause) {
				if (
					cause instanceof ScanError ||
					cause instanceof ValidationError ||
					(cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated') ||
					signal?.aborted
				)
					throw cause;
				throw new ScanError('ScanUnavailable', 'Unable to save scan review. Try again.', 503);
			}
		},
		async uploadFrame(
			actor: AuthUser,
			input: {
				sessionId: string;
				bytes: Uint8Array;
				contentType: string;
				fileName: string;
			},
			signal?: AbortSignal
		): Promise<{ artifact: ScanArtifact; result: ScanResult }> {
			const sessionId = assertUuid(input.sessionId, 'sessionId');
			await guarded(application.assertUploadable)(actor, sessionId);
			signal?.throwIfAborted();
			const contentType = checkImage(input.bytes, input.contentType, input.fileName),
				artifactId = crypto.randomUUID();
			const extension =
				contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
			const key = `scan-sessions/${sessionId}/${artifactId}.${extension}`;
			let attached = false,
				uncertain = false;
			const user = await auth.requireActor(actor);
			try {
				await storage.write(key, input.bytes, contentType, signal);
				const result = await processScanArtifact(
					config.workerUrl ?? 'http://scan-worker:8080',
					catalog,
					{
						sessionId,
						artifactId,
						originalObjectKey: key,
						contentType,
						fileName: input.fileName
					},
					signal
				);
				signal?.throwIfAborted();
				const client = await pool.connect();
				let connectionFailed = false;
				const onConnectionError = () => {
					connectionFailed = true;
				};
				client.on('error', onConnectionError);
				try {
					const row = await drizzle(client, { schema }).transaction(async (tx) => {
						await tx.execute("SET LOCAL lock_timeout = '5s'");
						await tx.execute("SET LOCAL statement_timeout = '10s'");
						await tx.execute("SET LOCAL transaction_timeout = '15s'");
						const current = await authorizeScan(tx, actor, auth);
						const session = await lockScanSession(tx, current.accountId, sessionId);
						assertOpen(session.status);
						signal?.throwIfAborted();
						const [row] = await tx
							.insert(scanArtifacts)
							.values({
								id: artifactId,
								sessionId,
								accountId: current.accountId,
								originalObjectKey: key,
								normalizedObjectKey: key,
								status: result.status,
								qualityScore: result.qualityScore,
								embeddingModelVersion: result.embeddingModelVersion,
								ocrModelVersion: result.ocrModelVersion,
								ocrName: result.ocrTokens.name,
								ocrSetCode: result.ocrTokens.setCode,
								ocrCollectorNumber: result.ocrTokens.collectorNumber,
								candidateJson: result.candidates
							})
							.returning();
						await tx
							.update(scanSessions)
							.set({ status: 'pending_review', updatedAt: new Date() })
							.where(eq(scanSessions.id, sessionId));
						signal?.throwIfAborted();
						uncertain = true;
						return row;
					});
					attached = true;
					return { artifact: artifactDto(row), result: resultDto(row) };
				} finally {
					const discard = connectionFailed || (uncertain && !attached);
					if (!discard) client.off('error', onConnectionError);
					client.release(discard);
				}
			} catch (cause) {
				if (uncertain && !attached) {
					// Destroying the original connection prevents late commands. Ordered recovery locks wait for any dispatched COMMIT.
					try {
						attached = await db.transaction(async (tx) => {
							await tx.execute("SET LOCAL lock_timeout = '5s'");
							await tx.execute("SET LOCAL statement_timeout = '10s'");
							await tx
								.select()
								.from(schema.userProfiles)
								.where(eq(schema.userProfiles.accountId, user.accountId))
								.for('update');
							await lockScanSession(tx, user.accountId, sessionId);
							const [row] = await tx
								.select({ id: scanArtifacts.id })
								.from(scanArtifacts)
								.where(
									and(
										eq(scanArtifacts.id, artifactId),
										eq(scanArtifacts.accountId, user.accountId),
										eq(scanArtifacts.sessionId, sessionId)
									)
								);
							return Boolean(row);
						});
					} catch {
						attached = true;
						console.error('Unable to establish rejected Scan attachment outcome; object retained');
					}
				}
				if (!attached)
					try {
						await storage.delete(key);
					} catch {
						console.error('Failed to clean up a rejected Scan upload');
					}
				if (
					cause instanceof ScanError ||
					(cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated')
				)
					throw cause;
				if (signal?.aborted) throw signal.reason;
				throw new ScanError(
					'ScanProcessingFailed',
					'Scan processing failed. Retry the upload.',
					502
				);
			}
		},
		async readImage(actor: AuthUser, artifactId: string, signal?: AbortSignal) {
			const user = await auth.requireActor(actor);
			const id = assertUuid(artifactId, 'artifactId');
			try {
				const owned = await artifact(user.accountId, id);
				const result = await storage.read(owned.artifact.originalObjectKey, signal);
				await auth.requireActor(actor);
				return result;
			} catch (cause) {
				if (
					cause instanceof ScanError ||
					(cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated') ||
					signal?.aborted
				)
					throw cause;
				throw new ScanError('ScanUnavailable', 'Unable to load scan image. Try again.', 503);
			}
		},
		close() {
			storage.close();
		}
	};
}
