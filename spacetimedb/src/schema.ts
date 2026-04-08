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

// --- Schema export ---

const spacetimedb = schema({
  userProfile,
  inventory,
  inventoryCard,
  deck,
  deckCard,
});

export default spacetimedb;
