import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import {
  makeInventoryCardId,
  VALID_CONDITIONS,
  VALID_FINISHES,
} from '../lib/composite-key.js';
import { getOrCreateInventory } from './inventory.js';

function isValidCondition(condition: string): boolean {
  return (VALID_CONDITIONS as readonly string[]).includes(condition);
}

function isValidFinish(finish: string): boolean {
  return (VALID_FINISHES as readonly string[]).includes(finish);
}

function touchInventory(ctx: any, inventoryId: string): void {
  const inventory = ctx.db.inventory.id.find(inventoryId);
  if (!inventory) {
    return;
  }

  ctx.db.inventory.id.update({
    ...inventory,
    updatedAt: ctx.timestamp.microsSinceUnixEpoch,
  });
}

export const addToInventory = spacetimedb.reducer(
  {
    accountId: t.string(),
    game: t.string(),
    catalogCardId: t.string(),
    canonicalCardId: t.string(),
    name: t.string(),
    setCode: t.string(),
    imageUri: t.string(),
    finish: t.string(),
    condition: t.string(),
    quantity: t.u32(),
  },
  (
    ctx,
    { accountId, game, catalogCardId, canonicalCardId, name, setCode, imageUri, finish, condition, quantity }
  ) => {
    if (!isValidFinish(finish)) {
      throw new Error(`Invalid finish: ${finish}. Must be one of: ${VALID_FINISHES.join(', ')}`);
    }

    if (!isValidCondition(condition)) {
      throw new Error(`Invalid condition: ${condition}. Must be one of: ${VALID_CONDITIONS.join(', ')}`);
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const inventory = getOrCreateInventory(ctx, accountId, game);
    const entryId = makeInventoryCardId(inventory.id, catalogCardId, finish, condition);
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const existing = ctx.db.inventoryCard.entryId.find(entryId);

    if (existing) {
      ctx.db.inventoryCard.entryId.update({
        ...existing,
        canonicalCardId,
        name,
        setCode,
        imageUri,
        quantity: existing.quantity + quantity,
        updatedAt: now,
      });
      touchInventory(ctx, inventory.id);
      return;
    }

    const spellbookPosition = [...ctx.db.inventoryCard.inventory_card_inventory_id.filter(inventory.id)].length;
    ctx.db.inventoryCard.insert({
      entryId,
      inventoryId: inventory.id,
      ownerId: accountId,
      game,
      catalogCardId,
      canonicalCardId,
      name,
      setCode,
      imageUri,
      quantity,
      finish,
      condition,
      notes: '',
      spellbookPosition,
      addedAt: now,
      updatedAt: now,
    });

    touchInventory(ctx, inventory.id);
  }
);

export const updateInventoryCard = spacetimedb.reducer(
  {
    accountId: t.string(),
    entryId: t.string(),
    quantity: t.u32(),
    notes: t.string(),
  },
  (ctx, { accountId, entryId, quantity, notes }) => {
    const card = ctx.db.inventoryCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    if (card.ownerId !== accountId) {
      throw new Error('Permission denied: not the inventory owner');
    }

    if (quantity === 0) {
      throw new Error('Quantity must be greater than 0. Use removeFromInventory to delete.');
    }

    ctx.db.inventoryCard.entryId.update({
      ...card,
      quantity,
      notes,
      updatedAt: ctx.timestamp.microsSinceUnixEpoch,
    });

    touchInventory(ctx, card.inventoryId);
  }
);

export const removeFromInventory = spacetimedb.reducer(
  {
    accountId: t.string(),
    entryId: t.string(),
  },
  (ctx, { accountId, entryId }) => {
    const card = ctx.db.inventoryCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    if (card.ownerId !== accountId) {
      throw new Error('Permission denied: not the inventory owner');
    }

    ctx.db.inventoryCard.entryId.delete(entryId);

    const remaining = [...ctx.db.inventoryCard.inventory_card_inventory_id.filter(card.inventoryId)]
      .sort((a, b) => a.spellbookPosition - b.spellbookPosition);

    for (let index = 0; index < remaining.length; index += 1) {
      const row = remaining[index];
      if (row.spellbookPosition !== index) {
        ctx.db.inventoryCard.entryId.update({
          ...row,
          spellbookPosition: index,
          updatedAt: ctx.timestamp.microsSinceUnixEpoch,
        });
      }
    }

    touchInventory(ctx, card.inventoryId);
  }
);

export const reorderInventoryCard = spacetimedb.reducer(
  {
    accountId: t.string(),
    entryId: t.string(),
    targetPosition: t.u32(),
  },
  (ctx, { accountId, entryId, targetPosition }) => {
    const moved = ctx.db.inventoryCard.entryId.find(entryId);
    if (!moved) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    if (moved.ownerId !== accountId) {
      throw new Error('Permission denied: not the inventory owner');
    }

    const ordered = [...ctx.db.inventoryCard.inventory_card_inventory_id.filter(moved.inventoryId)]
      .sort((a, b) => a.spellbookPosition - b.spellbookPosition);
    const withoutMoved = ordered.filter((row) => row.entryId !== moved.entryId);
    const boundedPosition = Math.max(0, Math.min(Number(targetPosition), withoutMoved.length));

    withoutMoved.splice(boundedPosition, 0, moved);

    for (let index = 0; index < withoutMoved.length; index += 1) {
      const row = withoutMoved[index];
      if (row.spellbookPosition !== index) {
        ctx.db.inventoryCard.entryId.update({
          ...row,
          spellbookPosition: index,
          updatedAt: ctx.timestamp.microsSinceUnixEpoch,
        });
      }
    }

    touchInventory(ctx, moved.inventoryId);
  }
);
