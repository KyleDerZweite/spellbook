import {
	createCatalog,
	createLocalAuth,
	createProfile,
	createDashboard,
	createInventory,
	createInventoryMutations,
	createDecks
} from '@spellbook/backend';
import { db, pool } from '#lib/server/db/client.ts';

const catalog = createCatalog(pool);
const auth = createLocalAuth(db, { demoMode: process.env.DEMO_MODE === 'true' });
export const application = {
	catalog,
	auth,
	dashboard: createDashboard(pool, auth),
	inventory: { ...createInventory(pool, auth), ...createInventoryMutations(db, catalog, auth) },
	profile: createProfile(db, auth, { demoMode: process.env.DEMO_MODE === 'true' }),
	decks: createDecks(db, catalog, auth)
};
