import { building, dev } from '$app/env';
import {
	createCatalog,
	createLocalAuth,
	createProfile,
	createDashboard,
	createInventory,
	createInventoryMutations,
	createScan,
	createDecks,
	createValuation,
	createSavedState,
	createCategories,
	createInventoryValues,
	createValueHistoryRunner
} from '@spellbook/backend';
import { privateEnv } from '#lib/env/private.ts';
import { db, pool } from '#lib/server/db/client.ts';

const catalog = createCatalog(pool);
const auth = createLocalAuth(db, { demoMode: process.env.DEMO_MODE === 'true' });
const valuation = createValuation(pool, auth);
const timezone = process.env.VALUE_HISTORY_TIMEZONE?.trim() || 'Europe/Berlin';
new Intl.DateTimeFormat('en', { timeZone: timezone });
const enabled = process.env.VALUE_HISTORY_ENABLED ?? 'true';
if (!['true', 'false'].includes(enabled))
	throw Error('VALUE_HISTORY_ENABLED must be true or false');
const inventoryValues = createInventoryValues(pool, auth, valuation, { timezone });
const valueRunner = createValueHistoryRunner(pool, inventoryValues);
export const application = {
	catalog,
	auth,
	categories: createCategories(db, auth),
	savedState: createSavedState(
		privateEnv.DATABASE_URL || 'postgres://spellbook:spellbook@localhost:5432/spellbook',
		auth
	),
	dashboard: createDashboard(pool, auth, inventoryValues),
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
	valuation,
	inventoryValues,
	profile: createProfile(db, auth, { demoMode: process.env.DEMO_MODE === 'true' }),
	decks: createDecks(db, catalog, auth, valuation)
};

let closing: Promise<void> | undefined;
function closeApplication() {
	return (closing ??= Promise.allSettled([
		valueRunner.close(),
		application.savedState.close()
	]).then((results) => {
		if (results.some((result) => result.status === 'rejected'))
			console.error('Application shutdown failed');
	}));
}

if (!building) {
	if (enabled === 'true') valueRunner.start();
	if (!dev) process.once('sveltekit:shutdown', closeApplication);
	import.meta.hot?.dispose(closeApplication);
	import.meta.hot?.on('vite:beforeFullReload', closeApplication);
}

export { CategoryNotFound, CategoryConflict, CategoryMergeConflict } from '@spellbook/backend';
