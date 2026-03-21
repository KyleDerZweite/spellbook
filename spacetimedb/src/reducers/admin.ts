import spacetimedb from '../schema.js';
import { t } from 'spacetimedb/server';

/**
 * Sets a server configuration value. Used during deployment to inject
 * secrets that WASM modules cannot read from environment variables.
 *
 * WARNING: No access control in V1. Acceptable for single-user behind
 * Pangolin IAP. Must be restricted before multi-user deployment.
 */
export const setServerConfig = spacetimedb.reducer(
  {
    key: t.string(),
    value: t.string(),
  },
  (ctx, { key, value }) => {
    const existing = ctx.db.serverConfig.key.find(key);
    if (existing) {
      ctx.db.serverConfig.key.update({ ...existing, value });
    } else {
      ctx.db.serverConfig.insert({ key, value });
    }
  }
);
