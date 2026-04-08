import spacetimedb from '../schema.js';
import { ensureDefaultMtgInventory } from './inventory.js';
import { getProfileClaims } from '../lib/auth.js';

/**
 * Bootstrap the authenticated user profile when a client connects.
 */
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const { accountId, username, email } = getProfileClaims(ctx);
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
});
