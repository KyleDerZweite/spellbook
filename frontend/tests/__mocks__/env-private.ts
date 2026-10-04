export const env = {
	DATABASE_URL:
		process.env.TEST_DATABASE_URL ?? 'postgres://spellbook:spellbook@localhost:5432/spellbook_test',
	SCAN_STORAGE_DRIVER: 'local',
	SCAN_LOCAL_STORAGE_DIR: '/tmp/spellbook-test-scans',
	S3_ENDPOINT: 'http://localhost:9000',
	S3_REGION: 'us-east-1',
	S3_BUCKET: 'spellbook-scans',
	S3_ACCESS_KEY_ID: 'test-access-key',
	S3_SECRET_ACCESS_KEY: 'test-secret-key',
	S3_FORCE_PATH_STYLE: 'true',
	SCAN_WORKER_URL: 'http://localhost:8080'
};

export const privateEnv = env;
