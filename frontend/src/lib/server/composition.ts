import { building, dev } from '$app/env';
import { createApplication } from '@spellbook/backend/application.ts';
import { privateEnv } from '#lib/env/private.ts';

const lifetime = await createApplication({
	databaseUrl: privateEnv.DATABASE_URL,
	buildAnalysis: building,
	demoMode: process.env.DEMO_MODE === 'true',
	valueHistoryTimezone: process.env.VALUE_HISTORY_TIMEZONE,
	valueHistoryEnabled: process.env.VALUE_HISTORY_ENABLED,
	commanderSpellbookEnabled: process.env.COMMANDER_SPELLBOOK_ENABLED,
	scan: {
		storageDriver: privateEnv.SCAN_STORAGE_DRIVER,
		localStorageDir: privateEnv.SCAN_LOCAL_STORAGE_DIR,
		workerUrl: privateEnv.SCAN_WORKER_URL,
		s3Endpoint: privateEnv.S3_ENDPOINT,
		s3Region: privateEnv.S3_REGION,
		s3Bucket: privateEnv.S3_BUCKET,
		s3AccessKeyId: privateEnv.S3_ACCESS_KEY_ID,
		s3SecretAccessKey: privateEnv.S3_SECRET_ACCESS_KEY,
		s3ForcePathStyle: privateEnv.S3_FORCE_PATH_STYLE
	}
});
export const application = lifetime.application;
let closing: Promise<void> | undefined;
function closeApplication() {
	return (closing ??= lifetime.close().catch(() => console.error('Application shutdown failed')));
}
if (!building) {
	lifetime.start();
	if (!dev) process.once('sveltekit:shutdown', closeApplication);
	import.meta.hot?.dispose(closeApplication);
	import.meta.hot?.on('vite:beforeFullReload', closeApplication);
}
export {
	CategoryNotFound,
	CategoryConflict,
	CategoryMergeConflict,
	LibraryConflict,
	CategoryPreviewExpired,
	CategoryPreviewCapacity,
	CategoryUnavailable
} from '@spellbook/backend/transport.ts';
