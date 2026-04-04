import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import { makeDeckCardId } from '../lib/composite-key.js';

function makeEntityId(ctx: any, accountId: string): string {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  return `${accountId.slice(0, 8)}-${now.toString(36)}-${ctx.random().toString(36).slice(2)}`;
}

export const createDeck = spacetimedb.reducer(
  {
    accountId: t.string(),
    game: t.string(),
    name: t.string(),
    description: t.string(),
    format: t.string(),
  },
  (ctx, { accountId, game, name, description, format }) => {
    const user = ctx.db.userProfile.accountId.find(accountId);
    if (!user) {
      throw new Error(`User not found: ${accountId}`);
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.deck.insert({
      id: makeEntityId(ctx, accountId),
      ownerId: accountId,
      game,
      name,
      description,
      format,
      createdAt: now,
      updatedAt: now,
    });
  }
);

export const updateDeck = spacetimedb.reducer(
  {
    accountId: t.string(),
    deckId: t.string(),
    name: t.string(),
    description: t.string(),
    format: t.string(),
  },
  (ctx, { accountId, deckId, name, description, format }) => {
    const deck = ctx.db.deck.id.find(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    if (deck.ownerId !== accountId) {
      throw new Error('Permission denied: not the deck owner');
    }

    ctx.db.deck.id.update({
      ...deck,
      name,
      description,
      format,
      updatedAt: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
);

export const deleteDeck = spacetimedb.reducer(
  {
    accountId: t.string(),
    deckId: t.string(),
  },
  (ctx, { accountId, deckId }) => {
    const deck = ctx.db.deck.id.find(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    if (deck.ownerId !== accountId) {
      throw new Error('Permission denied: not the deck owner');
    }

    ctx.db.deckCard.deck_card_deck_id.delete(deckId);
    ctx.db.deck.id.delete(deckId);
  }
);

export const addToDeck = spacetimedb.reducer(
  {
    accountId: t.string(),
    deckId: t.string(),
    catalogCardId: t.string(),
    canonicalCardId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    quantity: t.u32(),
    role: t.string(),
  },
  (ctx, { accountId, deckId, catalogCardId, canonicalCardId, name, setCode, imageUri, quantity, role }) => {
    const deck = ctx.db.deck.id.find(deckId);
    if (!deck) {
      throw new Error(`Deck not found: ${deckId}`);
    }

    if (deck.ownerId !== accountId) {
      throw new Error('Permission denied: not the deck owner');
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const entryId = makeDeckCardId(deckId, catalogCardId, role);
    const existing = ctx.db.deckCard.entryId.find(entryId);
    const now = ctx.timestamp.microsSinceUnixEpoch;

    if (existing) {
      ctx.db.deckCard.entryId.update({
        ...existing,
        canonicalCardId,
        name,
        setCode,
        imageUri,
        quantity: existing.quantity + quantity,
        updatedAt: now,
      });
    } else {
      ctx.db.deckCard.insert({
        entryId,
        deckId,
        ownerId: accountId,
        game: deck.game,
        catalogCardId,
        canonicalCardId,
        name,
        setCode,
        imageUri,
        quantity,
        role,
        addedAt: now,
        updatedAt: now,
      });
    }

    ctx.db.deck.id.update({
      ...deck,
      updatedAt: now,
    });
  }
);

export const updateDeckCard = spacetimedb.reducer(
  {
    accountId: t.string(),
    entryId: t.string(),
    quantity: t.u32(),
  },
  (ctx, { accountId, entryId, quantity }) => {
    const card = ctx.db.deckCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Deck card not found: ${entryId}`);
    }

    if (card.ownerId !== accountId) {
      throw new Error('Permission denied: not the deck owner');
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0. Use removeFromDeck to delete.');
    }

    ctx.db.deckCard.entryId.update({
      ...card,
      quantity,
      updatedAt: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
);

export const removeFromDeck = spacetimedb.reducer(
  {
    accountId: t.string(),
    entryId: t.string(),
  },
  (ctx, { accountId, entryId }) => {
    const card = ctx.db.deckCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Deck card not found: ${entryId}`);
    }

    if (card.ownerId !== accountId) {
      throw new Error('Permission denied: not the deck owner');
    }

    ctx.db.deckCard.entryId.delete(entryId);
  }
);
