import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { privateEnv } from '$lib/env/private';
import * as schema from './schema';

const { Pool } = pg;

const databaseUrl = privateEnv.DATABASE_URL?.trim();
const isBuildAnalysis = process.env.npm_lifecycle_event === 'build';

if (!databaseUrl && !isBuildAnalysis) {
	throw new Error('DATABASE_URL must be configured for Postgres persistence');
}

export const pool = new Pool({
	connectionString: databaseUrl || 'postgres://spellbook:spellbook@localhost:5432/spellbook'
});

export const db = drizzle(pool, { schema });
