import { defineEnvVars } from '@sveltejs/kit/env';

const optional = { schema: (value: string | undefined) => value };

export const variables = defineEnvVars({
	APP_ORIGIN: optional,
	DATABASE_URL: optional,
	S3_ACCESS_KEY_ID: optional,
	S3_BUCKET: optional,
	S3_ENDPOINT: optional,
	S3_FORCE_PATH_STYLE: optional,
	S3_REGION: optional,
	S3_SECRET_ACCESS_KEY: optional,
	SCAN_LOCAL_STORAGE_DIR: optional,
	SCAN_STORAGE_DRIVER: optional,
	SCAN_WORKER_URL: optional
});
