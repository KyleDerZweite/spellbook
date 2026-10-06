import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.ts';

export function createDatabase(databaseUrl: string) {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof createDatabase>['db'];
