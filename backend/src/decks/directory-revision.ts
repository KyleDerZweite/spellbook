import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/client.ts';

export async function advanceDeckLibraryRevision(tx: Transaction, accountId: string) {
	await tx.execute(
		sql`INSERT INTO deck_library_state(account_id,revision) VALUES(${accountId},1) ON CONFLICT(account_id) DO UPDATE SET revision=deck_library_state.revision+1`
	);
}
