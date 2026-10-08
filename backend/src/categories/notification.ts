import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';

/** Existing account transport delivers this invalidation only after the owning commit. */
export async function publishCategoryChange(tx: Transaction, accountId: string) {
	await tx.execute(
		sql`SELECT pg_notify('spellbook_saved_state',json_build_object('accountId',${accountId}::text,'topic','decks')::text)`
	);
}
