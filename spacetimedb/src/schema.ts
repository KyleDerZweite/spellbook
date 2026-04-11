import { schema, table, t } from 'spacetimedb/server';

// --- Tables ---

const userProfile = table(
  { name: 'user_profile', public: true },
  {
    accountId: t.string().primaryKey(),    // Zitadel user subject
    username: t.string(),                   // preferred_username or fallback
    email: t.string(),                      // email claim when available
    lastSeen: t.u64(),                      // Unix timestamp microseconds
  }
);

const inventory = table(
  {
    name: 'inventory',
    public: true,
    indexes: [{ accessor: 'inventory_owner_id', algorithm: 'btree', columns: ['ownerId'] }],
  },
  {
    id: t.string().primaryKey(),
    ownerId: t.string(),
    game: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const inventoryCard = table(
  {
    name: 'inventory_card',
    public: true,
    indexes: [
      { accessor: 'inventory_card_owner_id', algorithm: 'btree', columns: ['ownerId'] },
      { accessor: 'inventory_card_inventory_id', algorithm: 'btree', columns: ['inventoryId'] }],
  },
  {
    entryId: t.string().primaryKey(),
    inventoryId: t.string(),
    ownerId: t.string(),
    game: t.string(),
    catalogCardId: t.string(),
    canonicalCardId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    quantity: t.u32(),
    finish: t.string(),
    condition: t.string(),
    notes: t.string(),
    spellbookPosition: t.u32(),
    addedAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const deck = table(
  {
    name: 'deck',
    public: true,
    indexes: [{ accessor: 'deck_owner_id', algorithm: 'btree', columns: ['ownerId'] }],
  },
  {
    id: t.string().primaryKey(),
    ownerId: t.string(),
    game: t.string(),
    name: t.string(),
    description: t.string(),
    format: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const deckCard = table(
  {
    name: 'deck_card',
    public: true,
    indexes: [
      { accessor: 'deck_card_owner_id', algorithm: 'btree', columns: ['ownerId'] },
      { accessor: 'deck_card_deck_id', algorithm: 'btree', columns: ['deckId'] },
    ],
  },
  {
    entryId: t.string().primaryKey(),
    deckId: t.string(),
    ownerId: t.string(),
    game: t.string(),
    catalogCardId: t.string(),
    canonicalCardId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    quantity: t.u32(),
    role: t.string(),
    addedAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const scanSession = table(
  {
    name: 'scan_session',
    public: true,
    indexes: [{ accessor: 'scan_session_owner_id', algorithm: 'btree', columns: ['ownerId'] }],
  },
  {
    id: t.string().primaryKey(),
    ownerId: t.string(),
    game: t.string(),
    status: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const scanArtifact = table(
  {
    name: 'scan_artifact',
    public: true,
    indexes: [
      { accessor: 'scan_artifact_owner_id', algorithm: 'btree', columns: ['ownerId'] },
      { accessor: 'scan_artifact_session_id', algorithm: 'btree', columns: ['sessionId'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    sessionId: t.string(),
    ownerId: t.string(),
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
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const scanReviewItem = table(
  {
    name: 'scan_review_item',
    public: true,
    indexes: [
      { accessor: 'scan_review_item_owner_id', algorithm: 'btree', columns: ['ownerId'] },
      { accessor: 'scan_review_item_session_id', algorithm: 'btree', columns: ['sessionId'] },
      { accessor: 'scan_review_item_artifact_id', algorithm: 'btree', columns: ['scanArtifactId'] },
    ],
  },
  {
    id: t.string().primaryKey(),
    sessionId: t.string(),
    scanArtifactId: t.string(),
    ownerId: t.string(),
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
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

const inventoryMutationRequest = table(
  {
    name: 'inventory_mutation_request',
    public: true,
    indexes: [
      {
        accessor: 'inventory_mutation_request_owner_id',
        algorithm: 'btree',
        columns: ['ownerId'],
      },
    ],
  },
  {
    requestId: t.string().primaryKey(),
    ownerId: t.string(),
    source: t.string(),
    status: t.string(),
    createdAt: t.u64(),
    updatedAt: t.u64(),
  }
);

// --- Schema export ---

const spacetimedb = schema({
  userProfile,
  inventory,
  inventoryCard,
  deck,
  deckCard,
  scanSession,
  scanArtifact,
  scanReviewItem,
  inventoryMutationRequest,
});

export default spacetimedb;
