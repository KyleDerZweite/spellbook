import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import {
  makeInventoryCardId,
  VALID_CONDITIONS,
  VALID_FINISHES,
} from '../lib/composite-key.js';
import { assertOwner, requireAuthenticatedAccountId } from '../lib/auth.js';
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

const BatchInventoryItem = t.object('BatchInventoryItem', {
  catalogCardId: t.string(),
  canonicalCardId: t.string(),
  name: t.string(),
  setCode: t.string(),
  imageUri: t.string(),
  finish: t.string(),
  condition: t.string(),
  quantity: t.u32(),
});

export const addToInventory = spacetimedb.reducer(
  {
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
    { game, catalogCardId, canonicalCardId, name, setCode, imageUri, finish, condition, quantity }
  ) => {
    const accountId = requireAuthenticatedAccountId(ctx);
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
    entryId: t.string(),
    quantity: t.u32(),
    notes: t.string(),
  },
  (ctx, { entryId, quantity, notes }) => {
    const card = ctx.db.inventoryCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    assertOwner(ctx, card.ownerId);

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
    entryId: t.string(),
  },
  (ctx, { entryId }) => {
    const card = ctx.db.inventoryCard.entryId.find(entryId);
    if (!card) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    assertOwner(ctx, card.ownerId);

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
    entryId: t.string(),
    targetPosition: t.u32(),
  },
  (ctx, { entryId, targetPosition }) => {
    const moved = ctx.db.inventoryCard.entryId.find(entryId);
    if (!moved) {
      throw new Error(`Inventory card not found: ${entryId}`);
    }

    assertOwner(ctx, moved.ownerId);

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

export const batchAddToInventory = spacetimedb.reducer(
  {
    requestId: t.string(),
    source: t.string(),
    game: t.string(),
    items: t.array(BatchInventoryItem),
  },
  (ctx, { requestId, source, game, items }) => {
    const accountId = requireAuthenticatedAccountId(ctx);
    const existingRequest = ctx.db.inventoryMutationRequest.requestId.find(requestId);
    if (existingRequest) {
      assertOwner(ctx, existingRequest.ownerId);
      return;
    }

    if (items.length === 0) {
      throw new Error('Batch add requires at least one item');
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.inventoryMutationRequest.insert({
      requestId,
      ownerId: accountId,
      source,
      status: 'applied',
      createdAt: now,
      updatedAt: now,
    });

    const inventory = getOrCreateInventory(ctx, accountId, game);
    for (const item of items) {
      if (!isValidFinish(item.finish)) {
        throw new Error(`Invalid finish: ${item.finish}. Must be one of: ${VALID_FINISHES.join(', ')}`);
      }

      if (!isValidCondition(item.condition)) {
        throw new Error(`Invalid condition: ${item.condition}. Must be one of: ${VALID_CONDITIONS.join(', ')}`);
      }

      if (item.quantity === 0) {
        throw new Error('Quantity must be greater than 0');
      }

      const entryId = makeInventoryCardId(inventory.id, item.catalogCardId, item.finish, item.condition);
      const existing = ctx.db.inventoryCard.entryId.find(entryId);

      if (existing) {
        ctx.db.inventoryCard.entryId.update({
          ...existing,
          canonicalCardId: item.canonicalCardId,
          name: item.name,
          setCode: item.setCode,
          imageUri: item.imageUri,
          quantity: existing.quantity + item.quantity,
          updatedAt: now,
        });
        continue;
      }

      const spellbookPosition = [...ctx.db.inventoryCard.inventory_card_inventory_id.filter(inventory.id)].length;
      ctx.db.inventoryCard.insert({
        entryId,
        inventoryId: inventory.id,
        ownerId: accountId,
        game,
        catalogCardId: item.catalogCardId,
        canonicalCardId: item.canonicalCardId,
        name: item.name,
        setCode: item.setCode,
        imageUri: item.imageUri,
        quantity: item.quantity,
        finish: item.finish,
        condition: item.condition,
        notes: '',
        spellbookPosition,
        addedAt: now,
        updatedAt: now,
      });
    }

    touchInventory(ctx, inventory.id);
  }
);
