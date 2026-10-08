// Compatibility adapter for persistence callers awaiting their feature migration.
import { createDatabase } from '@spellbook/backend';
import { privateEnv } from '#lib/env/private.ts';

const databaseUrl = privateEnv.DATABASE_URL?.trim();
const isBuildAnalysis = process.env.npm_lifecycle_event === 'build';
if (!databaseUrl && !isBuildAnalysis)
	throw new Error('DATABASE_URL must be configured for Postgres persistence');
const comboEnabled = process.env.COMMANDER_SPELLBOOK_ENABLED ?? 'false';
if (!['true', 'false'].includes(comboEnabled))
	throw new Error('COMMANDER_SPELLBOOK_ENABLED must be true or false');
export const { db, pool } = createDatabase(
	databaseUrl || 'postgres://spellbook:spellbook@localhost:5432/spellbook',
	{ commanderSpellbookEnabled: comboEnabled === 'true' }
);
