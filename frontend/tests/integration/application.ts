import { createApplication } from '@spellbook/backend/application.ts';

export function createTestApplication() {
	if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must be configured');
	return createApplication({
		databaseUrl: process.env.TEST_DATABASE_URL,
		demoMode: process.env.DEMO_MODE === 'true',
		valueHistoryEnabled: 'false',
		commanderSpellbookEnabled: process.env.COMMANDER_SPELLBOOK_ENABLED
	});
}
