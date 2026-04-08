import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import { requireAuthenticatedAccountId } from '../lib/auth.js';

const DEFAULT_GAME = 'mtg';

function findInventoryByOwnerAndGame(ctx: any, accountId: string, game: string) {
  for (const inventory of ctx.db.inventory.inventory_owner_id.filter(accountId)) {
    if (inventory.game === game) {
      return inventory;
    }
  }

  return undefined;
}

function makeEntityId(ctx: any, accountId: string): string {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  return `${accountId.slice(0, 8)}-${now.toString(36)}-${ctx.random().toString(36).slice(2)}`;
}

export const ensureInventory = spacetimedb.reducer(
  {
    game: t.string(),
  },
  (ctx, { game }) => {
    const accountId = requireAuthenticatedAccountId(ctx);
    const user = ctx.db.userProfile.accountId.find(accountId);
    if (!user) {
      throw new Error(`User not found: ${accountId}`);
    }

    const existing = findInventoryByOwnerAndGame(ctx, accountId, game);
    if (existing) {
      return;
    }

    const now = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.inventory.insert({
      id: makeEntityId(ctx, accountId),
      ownerId: accountId,
      game,
      createdAt: now,
      updatedAt: now,
    });
  }
);

export function ensureDefaultMtgInventory(ctx: any, accountId: string): void {
  const existing = findInventoryByOwnerAndGame(ctx, accountId, DEFAULT_GAME);
  if (existing) {
    return;
  }

  const now = ctx.timestamp.microsSinceUnixEpoch;
  ctx.db.inventory.insert({
    id: makeEntityId(ctx, accountId),
    ownerId: accountId,
    game: DEFAULT_GAME,
    createdAt: now,
    updatedAt: now,
  });
}

export function getOrCreateInventory(ctx: any, accountId: string, game: string) {
  const existing = findInventoryByOwnerAndGame(ctx, accountId, game);
  if (existing) {
    return existing;
  }

  const now = ctx.timestamp.microsSinceUnixEpoch;
  const created = {
    id: makeEntityId(ctx, accountId),
    ownerId: accountId,
    game,
    createdAt: now,
    updatedAt: now,
  };

  ctx.db.inventory.insert(created);
  return created;
}
