import {
	createCatalog,
	createLocalAuth,
	createProfile,
	createDashboard,
	createInventory,
	createDecks,
	createSavedState
} from '@spellbook/backend';
import { privateEnv } from '#lib/env/private.ts';
import { db, pool } from '#lib/server/db/client.ts';

const catalog = createCatalog(pool);
const auth = createLocalAuth(db, { demoMode: process.env.DEMO_MODE === 'true' });
export const application = {
	catalog,
	auth,
	savedState: createSavedState(
		privateEnv.DATABASE_URL || 'postgres://spellbook:spellbook@localhost:5432/spellbook',
		auth
	),
	dashboard: createDashboard(pool, auth),
	inventory: createInventory(pool, auth),
	profile: createProfile(db, auth, { demoMode: process.env.DEMO_MODE === 'true' }),
	decks: createDecks(db, catalog, auth)
};
