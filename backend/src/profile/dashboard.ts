import type { Pool } from 'pg';
import type {
	DashboardApplication,
	DashboardSummary,
	DashboardRecentEntry,
	DashboardDeck
} from '@spellbook/contracts/dashboard.ts';
import type { ProfileTotals } from '@spellbook/contracts/profile.ts';
import type { createLocalAuth } from '../auth/local.ts';

export function createDashboard(
	pool: Pool,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
): DashboardApplication {
	return {
		async get(actor) {
			const user = await auth.requireActor(actor);
			const client = await pool.connect();
			try {
				await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
				const args = [user.accountId];
				const totals = (
					await client.query<ProfileTotals>(
						`SELECT coalesce(sum(quantity),0)::int AS total, count(distinct canonical_card_id)::int AS names, count(distinct catalog_card_id)::int AS printings, count(distinct set_code)::int AS sets, coalesce(sum(quantity) FILTER(WHERE finish='foil'),0)::int AS foils, (SELECT count(*)::int FROM decks WHERE account_id=$1 AND game='mtg') AS decks FROM inventory_cards WHERE account_id=$1 AND game='mtg'`,
						args
					)
				).rows[0];
				const distribution = async (
					column: 'set_code' | 'finish' | 'condition',
					labels?: string[]
				) => {
					const rows = (
						await client.query<{ label: string; quantity: number }>(
							`SELECT ${column} AS label, sum(quantity)::int AS quantity FROM inventory_cards WHERE account_id=$1 AND game='mtg' GROUP BY ${column} ORDER BY quantity DESC, label`,
							args
						)
					).rows;
					return (
						labels
							? labels.map((label) => ({
									label,
									quantity: rows.find((row) => row.label === label)?.quantity ?? 0
								}))
							: rows
					).map((row) => ({ ...row, share: totals.total ? row.quantity / totals.total : 0 }));
				};
				const sets = await distribution('set_code');
				const finishes = await distribution('finish', ['nonfoil', 'foil']);
				const conditions = await distribution('condition', ['NM', 'LP', 'MP', 'HP', 'DMG']);
				const recent = (
					await client.query<Omit<DashboardRecentEntry, 'updatedAt'> & { updatedAt: Date }>(
						`SELECT id, catalog_card_id AS "catalogCardId", canonical_card_id AS "canonicalCardId", name, set_code AS "setCode", image_uri AS "imageUri", quantity, finish, condition, updated_at AS "updatedAt" FROM inventory_cards WHERE account_id=$1 AND game='mtg' ORDER BY updated_at DESC,id LIMIT 8`,
						args
					)
				).rows;
				const decks = (
					await client.query<DashboardDeck>(
						`WITH owned_printings AS (
    SELECT canonical_card_id,catalog_card_id,sum(quantity) AS quantity FROM inventory_cards WHERE account_id=$1 AND game='mtg' GROUP BY canonical_card_id,catalog_card_id
   ), owned_names AS (SELECT canonical_card_id,sum(quantity) AS quantity FROM owned_printings GROUP BY canonical_card_id), required_printings AS (
    SELECT dc.deck_id,dc.canonical_card_id,dc.catalog_card_id,sum(dc.quantity) AS quantity FROM deck_cards dc JOIN decks d ON d.id=dc.deck_id WHERE d.account_id=$1 AND d.game='mtg' GROUP BY dc.deck_id,dc.canonical_card_id,dc.catalog_card_id
   ), allocation AS (
    SELECT r.deck_id,r.canonical_card_id,sum(r.quantity) AS required,sum(least(r.quantity,coalesce(o.quantity,0))) AS exact FROM required_printings r LEFT JOIN owned_printings o USING(canonical_card_id,catalog_card_id) GROUP BY r.deck_id,r.canonical_card_id
   ), totals AS (
    SELECT a.deck_id,sum(a.required)::int AS required,sum(a.exact)::int AS exact,sum(least(a.required-a.exact,greatest(coalesce(o.quantity,0)-a.exact,0)))::int AS alternate FROM allocation a LEFT JOIN owned_names o USING(canonical_card_id) GROUP BY a.deck_id
   ) SELECT d.id,d.name,d.format,coalesce(t.required,0) AS required,coalesce(t.exact,0) AS exact,coalesce(t.alternate,0) AS alternate,coalesce(t.required-t.exact-t.alternate,0) AS missing FROM decks d LEFT JOIN totals t ON t.deck_id=d.id WHERE d.account_id=$1 AND d.game='mtg' ORDER BY d.updated_at DESC,d.id`,
						args
					)
				).rows;
				// Scan storage remains optional during rollout, matching the existing unavailable-count state.
				await client.query('SAVEPOINT scan_summary');
				let pendingScanReviews: number | null;
				try {
					pendingScanReviews = (
						await client.query<{ count: number }>(
							`SELECT count(*)::int AS count FROM scan_sessions WHERE account_id=$1 AND game='mtg' AND status='pending_review'`,
							args
						)
					).rows[0].count;
				} catch {
					await client.query('ROLLBACK TO SAVEPOINT scan_summary');
					pendingScanReviews = null;
				}
				await client.query('COMMIT');
				return {
					totals,
					sets,
					finishes,
					conditions,
					recentEntries: recent.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
					decks,
					pendingScanReviews
				} satisfies DashboardSummary;
			} catch (cause) {
				await client.query('ROLLBACK');
				throw cause;
			} finally {
				client.release();
			}
		}
	};
}
