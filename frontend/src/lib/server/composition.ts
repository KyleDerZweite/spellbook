import { createCatalog, createLocalAuth } from '@spellbook/backend';
import { db, pool } from '#lib/server/db/client.ts';

export const application = {
	catalog: createCatalog(pool),
	auth: createLocalAuth(db, { demoMode: process.env.DEMO_MODE === 'true' })
};
