import { createDatabase, createCatalog, createLocalAuth } from '@spellbook/backend';
import { privateEnv } from '#lib/env/private.ts';

const databaseUrl = privateEnv.DATABASE_URL?.trim();
const isBuildAnalysis = process.env.npm_lifecycle_event === 'build';
if (!databaseUrl && !isBuildAnalysis)
	throw new Error('DATABASE_URL must be configured for Postgres persistence');
const database = createDatabase(
	databaseUrl || 'postgres://spellbook:spellbook@localhost:5432/spellbook'
);
export const application = {
	...database,
	catalog: createCatalog(database.pool),
	auth: createLocalAuth(database.db, { demoMode: process.env.DEMO_MODE === 'true' })
};
