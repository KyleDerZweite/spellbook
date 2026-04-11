import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import { assertOwner, requireAuthenticatedAccountId } from '../lib/auth.js';

function touchSession(ctx: any, sessionId: string, status?: string): void {
  const session = ctx.db.scanSession.id.find(sessionId);
  if (!session) {
    throw new Error(`Scan session not found: ${sessionId}`);
  }

  ctx.db.scanSession.id.update({
    ...session,
    status: status ?? session.status,
    updatedAt: ctx.timestamp.microsSinceUnixEpoch,
  });
}

export const createScanSession = spacetimedb.reducer(
  {
    sessionId: t.string(),
    game: t.string(),
  },
  (ctx, { sessionId, game }) => {
    const accountId = requireAuthenticatedAccountId(ctx);
    const existing = ctx.db.scanSession.id.find(sessionId);
    if (existing) {
      assertOwner(ctx, existing.ownerId);
      return;
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.scanSession.insert({
      id: sessionId,
      ownerId: accountId,
      game,
      status: 'pending_upload',
      createdAt: now,
      updatedAt: now,
    });
  }
);

export const recordScanArtifact = spacetimedb.reducer(
  {
    artifactId: t.string(),
    sessionId: t.string(),
    originalObjectKey: t.string(),
    normalizedObjectKey: t.string(),
    qualityScore: t.u32(),
    embeddingModelVersion: t.string(),
    ocrModelVersion: t.string(),
    status: t.string(),
    ocrName: t.string().optional(),
    ocrSetCode: t.string().optional(),
    ocrCollectorNumber: t.string().optional(),
    candidateJson: t.string(),
  },
  (
    ctx,
    {
      artifactId,
      sessionId,
      originalObjectKey,
      normalizedObjectKey,
      qualityScore,
      embeddingModelVersion,
      ocrModelVersion,
      status,
      ocrName,
      ocrSetCode,
      ocrCollectorNumber,
      candidateJson,
    }
  ) => {
    const session = ctx.db.scanSession.id.find(sessionId);
    if (!session) {
      throw new Error(`Scan session not found: ${sessionId}`);
    }

    assertOwner(ctx, session.ownerId);
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const existing = ctx.db.scanArtifact.id.find(artifactId);

    if (existing) {
      ctx.db.scanArtifact.id.update({
        ...existing,
        originalObjectKey,
        normalizedObjectKey,
        qualityScore,
        embeddingModelVersion,
        ocrModelVersion,
        status,
        ocrName,
        ocrSetCode,
        ocrCollectorNumber,
        candidateJson,
        updatedAt: now,
      });
    } else {
      ctx.db.scanArtifact.insert({
        id: artifactId,
        sessionId,
        ownerId: session.ownerId,
        originalObjectKey,
        normalizedObjectKey,
        qualityScore,
        embeddingModelVersion,
        ocrModelVersion,
        status,
        ocrName,
        ocrSetCode,
        ocrCollectorNumber,
        candidateJson,
        createdAt: now,
        updatedAt: now,
      });
    }

    touchSession(ctx, sessionId, status);
  }
);

export const upsertScanReviewItem = spacetimedb.reducer(
  {
    id: t.string(),
    sessionId: t.string(),
    scanArtifactId: t.string(),
    catalogCardId: t.string(),
    canonicalCardId: t.string(),
    oracleId: t.string(),
    name: t.string(),
    setCode: t.string(),
    collectorNumber: t.string(),
    imageUri: t.string(),
    similarityScore: t.u32(),
    ocrScore: t.u32(),
    finalScore: t.u32(),
    matchReason: t.string(),
    finish: t.string(),
    condition: t.string(),
    quantity: t.u32(),
  },
  (ctx, args) => {
    const artifact = ctx.db.scanArtifact.id.find(args.scanArtifactId);
    if (!artifact) {
      throw new Error(`Scan artifact not found: ${args.scanArtifactId}`);
    }

    assertOwner(ctx, artifact.ownerId);
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const existing = ctx.db.scanReviewItem.id.find(args.id);

    if (existing) {
      ctx.db.scanReviewItem.id.update({
        ...existing,
        ...args,
        ownerId: artifact.ownerId,
        updatedAt: now,
      });
    } else {
      ctx.db.scanReviewItem.insert({
        ...args,
        ownerId: artifact.ownerId,
        createdAt: now,
        updatedAt: now,
      });
    }

    touchSession(ctx, args.sessionId, 'pending_review');
  }
);

export const updateScanSessionStatus = spacetimedb.reducer(
  {
    sessionId: t.string(),
    status: t.string(),
  },
  (ctx, { sessionId, status }) => {
    const session = ctx.db.scanSession.id.find(sessionId);
    if (!session) {
      throw new Error(`Scan session not found: ${sessionId}`);
    }

    assertOwner(ctx, session.ownerId);
    touchSession(ctx, sessionId, status);
  }
);
