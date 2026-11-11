export const env = {
	DATABASE_URL:
		process.env.TEST_DATABASE_URL ?? 'postgres://spellbook:spellbook@localhost:5432/spellbook_test',
	SCAN_WORKER_URL: 'http://localhost:8080'
};

export const privateEnv = env;
