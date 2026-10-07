import { and, count, desc, eq, gt } from 'drizzle-orm';
import type {
	ScanArtifact,
	ScanResult,
	ScanReviewItem,
	ScanSession,
	ScanSessionResult
} from '@spellbook/contracts/scan.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { Database } from '../db/client.ts';
import { scanArtifacts, scanReviewItems, scanSessions } from '../db/schema.ts';
import { assertUuid, ValidationError } from '../mtg/validation.ts';
import { candidateArray, candidateDto, score, status, text, ScanError } from './validation.ts';
import type { ScanAuth } from './access.ts';
export function sessionDto(row: typeof scanSessions.$inferSelect): ScanSession {
	if (
		row.game !== 'mtg' ||
		!['open', 'pending_review', 'committed', 'cancelled'].includes(row.status)
	)
		throw new Error('Invalid stored Scan session');
	return {
		id: row.id,
		game: 'mtg',
		status: row.status as ScanSession['status'],
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}
export function resultDto(row: typeof scanArtifacts.$inferSelect): ScanResult {
	const candidates = candidateArray(row.candidateJson);
	return {
		artifactId: row.id,
		status: status(row.status, candidates.length),
		qualityScore: score(row.qualityScore),
		embeddingModelVersion: text(row.embeddingModelVersion, 'embeddingModelVersion', 128),
		ocrModelVersion: text(row.ocrModelVersion, 'ocrModelVersion', 128),
		ocrTokens: {
			...(row.ocrName === null ? {} : { name: text(row.ocrName, 'ocrName', 5000, true) }),
			...(row.ocrSetCode === null
				? {}
				: { setCode: text(row.ocrSetCode, 'ocrSetCode', 5000, true) }),
			...(row.ocrCollectorNumber === null
				? {}
				: {
						collectorNumber: text(row.ocrCollectorNumber, 'ocrCollectorNumber', 5000, true)
					})
		},
		candidates
	};
}
export function artifactDto(row: typeof scanArtifacts.$inferSelect): ScanArtifact {
	return {
		...resultDto(row),
		id: row.id,
		sessionId: row.sessionId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}
function reviewDto(row: typeof scanReviewItems.$inferSelect): ScanReviewItem {
	return {
		...candidateDto(row),
		id: row.id,
		sessionId: row.sessionId,
		scanArtifactId: row.scanArtifactId,
		finish: row.finish,
		condition: row.condition,
		quantity: row.quantity,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}
export function createScanReader(db: Database, auth: ScanAuth) {
	return {
		async listSessions(actor: AuthUser) {
			const user = await auth.requireActor(actor);
			try {
				const rows = await db
					.select()
					.from(scanSessions)
					.where(eq(scanSessions.accountId, user.accountId))
					.orderBy(desc(scanSessions.updatedAt), desc(scanSessions.id))
					.limit(100);
				await auth.requireActor(actor);
				return rows.map(sessionDto);
			} catch (cause) {
				if (
					cause &&
					typeof cause === 'object' &&
					'kind' in cause &&
					cause.kind === 'Unauthenticated'
				)
					throw cause;
				throw new ScanError('ScanUnavailable', 'Unable to load scans. Try again.', 503);
			}
		},
		async readSession(
			actor: AuthUser,
			input: {
				sessionId: string;
				artifactCursor?: string;
				reviewCursor?: string;
				limit?: number;
			}
		): Promise<ScanSessionResult> {
			const sessionId = assertUuid(input.sessionId, 'sessionId');
			const limit = input.limit ?? 50;
			if (!Number.isInteger(limit) || limit < 1 || limit > 100)
				throw new ValidationError('Scan page limit must be from 1 to 100');
			const artifactCursor =
				input.artifactCursor === undefined
					? undefined
					: assertUuid(input.artifactCursor, 'artifactCursor');
			const reviewCursor =
				input.reviewCursor === undefined
					? undefined
					: assertUuid(input.reviewCursor, 'reviewCursor');
			const user = await auth.requireActor(actor);
			try {
				const result = await db.transaction(
					async (tx) => {
						const [session] = await tx
							.select()
							.from(scanSessions)
							.where(
								and(eq(scanSessions.accountId, user.accountId), eq(scanSessions.id, sessionId))
							)
							.limit(1);
						if (!session) throw new ScanError('ScanNotFound', 'Scan session not found', 404);
						const artifactWhere = and(
							eq(scanArtifacts.accountId, user.accountId),
							eq(scanArtifacts.sessionId, sessionId)
						);
						const reviewWhere = and(
							eq(scanReviewItems.accountId, user.accountId),
							eq(scanReviewItems.sessionId, sessionId)
						);
						const artifacts = await tx
							.select()
							.from(scanArtifacts)
							.where(
								and(
									artifactWhere,
									artifactCursor ? gt(scanArtifacts.id, artifactCursor) : undefined
								)
							)
							.orderBy(scanArtifacts.id)
							.limit(limit + 1);
						const reviews = await tx
							.select()
							.from(scanReviewItems)
							.where(
								and(reviewWhere, reviewCursor ? gt(scanReviewItems.id, reviewCursor) : undefined)
							)
							.orderBy(scanReviewItems.id)
							.limit(limit + 1);
						const [latest] = await tx
							.select()
							.from(scanArtifacts)
							.where(artifactWhere)
							.orderBy(desc(scanArtifacts.updatedAt), desc(scanArtifacts.id))
							.limit(1);
						const [artifactCount] = await tx
							.select({ total: count() })
							.from(scanArtifacts)
							.where(artifactWhere);
						const [reviewCount] = await tx
							.select({ total: count() })
							.from(scanReviewItems)
							.where(reviewWhere);
						return {
							session: sessionDto(session),
							artifacts: artifacts.slice(0, limit).map(artifactDto),
							reviewItems: reviews.slice(0, limit).map(reviewDto),
							artifactCount: artifactCount.total,
							reviewCount: reviewCount.total,
							nextArtifactCursor: artifacts.length > limit ? artifacts[limit - 1].id : null,
							nextReviewCursor: reviews.length > limit ? reviews[limit - 1].id : null,
							lastResult: latest ? resultDto(latest) : null
						};
					},
					{ isolationLevel: 'repeatable read', accessMode: 'read only' }
				);
				await auth.requireActor(actor);
				return result;
			} catch (cause) {
				if (
					cause instanceof ScanError ||
					(cause &&
						typeof cause === 'object' &&
						'kind' in cause &&
						cause.kind === 'Unauthenticated')
				)
					throw cause;
				throw new ScanError('ScanUnavailable', 'Unable to load scans. Try again.', 503);
			}
		}
	};
}
