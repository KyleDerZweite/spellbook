import { createCatalog, createLocalAuth, createProfile, createDashboard } from '@spellbook/backend';
import { db, pool } from '#lib/server/db/client.ts';

const auth = createLocalAuth(db, { demoMode: process.env.DEMO_MODE === 'true' });
export const application = {
	catalog: createCatalog(pool),
	auth,
	dashboard: createDashboard(pool, auth),
	profile: createProfile(db, auth, { demoMode: process.env.DEMO_MODE === 'true' })
};
