export const env = {
	MEILI_MASTER_KEY: 'test-master-key',
	MEILISEARCH_INTERNAL_URL: 'http://localhost:7700',
	OIDC_ISSUER: 'https://auth.example.test',
	OIDC_CLIENT_ID: 'spellbook-client',
	OIDC_MOBILE_CLIENT_ID: 'spellbook-mobile-client',
	APP_ORIGIN: 'https://spellbook.example.test',
	AUTH_SESSION_SECRET: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY',
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
