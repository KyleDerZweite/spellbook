import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import { makeCompositeId, VALID_CONDITIONS } from '../lib/composite-key.js';

/**
 * Adds a card to a collection. If the same card (same printing, foil status,
 * condition) already exists, increments quantity instead of creating a duplicate.
 */
export const addToCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    collectionId: t.string(),
    scryfallId: t.string(),
    oracleId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    isFoil: t.bool(),
    condition: t.string(),
    quantity: t.u32(),
  },
  (ctx, { accountId, collectionId, scryfallId, oracleId, name, setCode, imageUri, isFoil, condition, quantity }) => {
    const coll = ctx.db.collection.id.find(collectionId);
    if (!coll) {
      throw new Error(`Collection not found: ${collectionId}`);
    }
    if (coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    if (!(VALID_CONDITIONS as readonly string[]).includes(condition)) {
      throw new Error(`Invalid condition: ${condition}. Must be one of: ${VALID_CONDITIONS.join(', ')}`);
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const compositeId = makeCompositeId(collectionId, scryfallId, isFoil, condition);
    const now = ctx.timestamp.microsSinceUnixEpoch;

    const existing = ctx.db.collectionCard.compositeId.find(compositeId);
    if (existing) {
      ctx.db.collectionCard.compositeId.update({
        ...existing,
        quantity: existing.quantity + quantity,
        name,
        setCode,
        imageUri,
        updatedAt: now,
      });
    } else {
      ctx.db.collectionCard.insert({
        compositeId,
        collectionId,
        scryfallId,
        oracleId,
        name,
        setCode,
        imageUri,
        quantity,
        isFoil,
        condition,
        notes: '',
        addedAt: now,
        updatedAt: now,
      });
    }
  }
);

/**
 * Updates a collection card's quantity and notes.
 * Only the collection owner can update.
 */
export const updateCollectionCard = spacetimedb.reducer(
  {
    accountId: t.string(),
    compositeId: t.string(),
    quantity: t.u32(),
    notes: t.string(),
  },
  (ctx, { accountId, compositeId, quantity, notes }) => {
    const card = ctx.db.collectionCard.compositeId.find(compositeId);
    if (!card) {
      throw new Error(`Card not found: ${compositeId}`);
    }

    const coll = ctx.db.collection.id.find(card.collectionId);
    if (!coll || coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0. Use removeFromCollection to delete.');
    }

    ctx.db.collectionCard.compositeId.update({
      ...card,
      quantity,
      notes,
      updatedAt: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
);

/**
 * Removes a card from a collection entirely.
 * Only the collection owner can remove.
 */
export const removeFromCollection = spacetimedb.reducer(
  {
    accountId: t.string(),
    compositeId: t.string(),
  },
  (ctx, { accountId, compositeId }) => {
    const card = ctx.db.collectionCard.compositeId.find(compositeId);
    if (!card) {
      throw new Error(`Card not found: ${compositeId}`);
    }

    const coll = ctx.db.collection.id.find(card.collectionId);
    if (!coll || coll.ownerId !== accountId) {
      throw new Error('Permission denied: not the collection owner');
    }

    ctx.db.collectionCard.compositeId.delete(compositeId);
  }
);
