import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';
import { ensureDefaultMtgInventory } from './inventory.js';

/**
 * Called when a user connects. Upserts UserProfile with identity
 * from Pangolin IAP headers (passed via SvelteKit signed token).
 */
export const connectUser = spacetimedb.reducer(
  {
    accountId: t.string(),
    username: t.string(),
    email: t.string(),
  },
  (ctx, { accountId, username, email }) => {
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const existing = ctx.db.userProfile.accountId.find(accountId);

    if (existing) {
      ctx.db.userProfile.accountId.update({ ...existing, username, email, lastSeen: now });
    } else {
      ctx.db.userProfile.insert({
        accountId,
        username,
        email,
        lastSeen: now,
      });
    }

    ensureDefaultMtgInventory(ctx, accountId);
  }
);
