import {
	createCatalog,
	createLocalAuth,
	createProfile,
	createDashboard,
	createInventory,
	createInventoryMutations,
	createScan,
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
	scan: createScan(db, pool, catalog, auth, {
		storageDriver: privateEnv.SCAN_STORAGE_DRIVER,
		localStorageDir: privateEnv.SCAN_LOCAL_STORAGE_DIR,
		workerUrl: privateEnv.SCAN_WORKER_URL,
		s3Endpoint: privateEnv.S3_ENDPOINT,
		s3Region: privateEnv.S3_REGION,
		s3Bucket: privateEnv.S3_BUCKET,
		s3AccessKeyId: privateEnv.S3_ACCESS_KEY_ID,
		s3SecretAccessKey: privateEnv.S3_SECRET_ACCESS_KEY,
		s3ForcePathStyle: privateEnv.S3_FORCE_PATH_STYLE
	}),
	inventory: { ...createInventory(pool, auth), ...createInventoryMutations(db, catalog, auth) },
	profile: createProfile(db, auth, { demoMode: process.env.DEMO_MODE === 'true' }),
	decks: createDecks(db, catalog, auth)
};
