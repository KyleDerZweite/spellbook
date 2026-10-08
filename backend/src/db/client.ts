import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { configureComboAdapter } from '../categories/combo-settings.ts';
import * as schema from './schema.ts';

export function createDatabase(
	databaseUrl: string,
	options: { commanderSpellbookEnabled?: boolean } = {}
) {
	const pool = new pg.Pool({ connectionString: databaseUrl });
	const db = drizzle(pool, { schema });
	configureComboAdapter(db, options.commanderSpellbookEnabled ?? false);
	return { pool, db };
}
export type Database = ReturnType<typeof createDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
