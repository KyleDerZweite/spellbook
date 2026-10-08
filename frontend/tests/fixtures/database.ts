import { createDatabase } from '@spellbook/backend/db/client.ts';
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL must be configured');
export const { db, pool } = createDatabase(databaseUrl, {
	commanderSpellbookEnabled: process.env.COMMANDER_SPELLBOOK_ENABLED === 'true'
});
