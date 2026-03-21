import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';

/**
 * Creates a new collection for the current user.
 */
export const createCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    name: t.string(),
    description: t.string(),
  },
  (ctx, { accountId, name, description }) => {
    const user = ctx.db.userProfile.accountId.find(accountId);
    if (!user) {
      throw new Error(`User not found: ${accountId}`);
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    // Generate ID without crypto.randomUUID() or Math.random() (not available in WASM)
    const id = `${accountId.slice(0, 8)}-${now.toString(36)}-${ctx.random().toString(36).slice(2)}`;

    ctx.db.collection.insert({
      id,
      ownerId: accountId,
      name,
      description,
      createdAt: now,
    });
  }
);

/**
 * Updates a collection's name and/or description.
 * Only the owner can update.
 */
export const updateCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
    name: t.string(),
    description: t.string(),
  },
  (ctx, { accountId, collectionId, name, description }) => {
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    ctx.db.collection.id.update({ ...coll, name, description });
  }
);

/**
 * Deletes a collection and ALL its cards.
 * Only the owner can delete.
 */
export const deleteCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
  },
  (ctx, { accountId, collectionId }) => {
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    // Delete all cards in this collection first
    for (const card of ctx.db.collectionCard.collection_card_collection_id.filter(collectionId)) {
      ctx.db.collectionCard.compositeId.delete(card.compositeId);
    }

    ctx.db.collection.id.delete(collectionId);
  }
);
