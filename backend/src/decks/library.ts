import { sql, type SQL } from 'drizzle-orm';
import type { Database, Transaction } from '../db/client.ts';
import { databaseInteger } from '../db/numbers.ts';
import { assertUuid } from '../mtg/validation.ts';
import {
	deckLibraryQueryKey,
	DECK_LIBRARY_BADGE_LIMIT
} from '@spellbook/contracts/deck-library.ts';
import type {
	DeckLibraryInput,
	DeckLibraryQuery,
	DeckLibraryPage,
	DeckLibraryCategories,
	DeckLibraryCategoryInput,
	DeckLibraryCategory,
	DeckLibraryLocation
} from '@spellbook/contracts/deck-library.ts';
import { parseDeckLibraryInput } from './query.ts';

export class DeckLibraryRevisionChanged extends Error {
	readonly kind = 'RevisionChanged';
	constructor(readonly revision: string) {
		super('Deck Library changed. Read the latest directory and retry.');
	}
}
/** Pending retains the last valid truth. Suppression still hides Manual decisions. */
export const wholeMembership = sql`NOT c.suppressed AND (c.automatic_active OR w.state='Manual') AND (w.manual='Include' OR (w.manual IS NULL AND w.truth='True'))`;
function matching(accountId: string, query: DeckLibraryQuery): SQL {
	const pattern = '%' + query.query.replace(/[\\%_]/g, '\\$&') + '%';
	return sql`d.account_id=${accountId} AND d.game='mtg'
		${query.query ? sql`AND d.name ILIKE ${pattern} ESCAPE ${'\\'}` : sql``}
		${query.format ? sql`AND d.format=${query.format}` : sql``}
		${
			query.categoryVersionIds.length
				? sql`AND EXISTS (SELECT 1 FROM deck_whole_categories c JOIN deck_whole_category_decisions w USING(deck_id,version_id) WHERE c.deck_id=d.id AND ${wholeMembership} AND c.version_id IN (${sql.join(
						query.categoryVersionIds.map((id) => sql`${id}::uuid`),
						sql`, `
					)}))`
				: sql``
		}`;
}
function ordering(query: DeckLibraryQuery): SQL {
	return query.sort === 'updated:desc'
		? sql`d.updated_at DESC, d.name COLLATE "inventory_root", d.id`
		: sql`d.name COLLATE "inventory_root" ${query.sort === 'name:desc' ? sql`DESC` : sql`ASC`}, d.id`;
}
async function revision(tx: Transaction, accountId: string, expected?: string) {
	const rows = await tx.execute(
		sql`SELECT revision::text FROM deck_library_state WHERE account_id=${accountId}`
	);
	const current = String(rows.rows[0]?.revision ?? '0');
	if (expected !== undefined && expected !== current) throw new DeckLibraryRevisionChanged(current);
	return current;
}
function integer(value: unknown) {
	return databaseInteger(String(value));
}
function read<T>(db: Database, operation: (tx: Transaction) => Promise<T>) {
	return db.transaction(operation, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
export async function readDeckLibrary(
	db: Database,
	accountId: string,
	input: DeckLibraryInput = {}
): Promise<DeckLibraryPage> {
	const { query, offset, limit, expectedRevision } = parseDeckLibraryInput(input);
	return read(db, async (tx) => {
		const current = await revision(tx, accountId, expectedRevision);
		const totals = await tx.execute(
			sql`SELECT count(*)::text AS global_total, count(*) FILTER(WHERE ${matching(accountId, query)})::text AS matching_total FROM decks d WHERE d.account_id=${accountId} AND d.game='mtg'`
		);
		const rows = await tx.execute(sql`SELECT d.id,d.name,d.format,d.created_at,d.updated_at,
			COALESCE(s.quantity,'0') AS quantity,COALESCE(s.image_uri,'') AS image_uri,
			COALESCE(b.badges,'[]'::jsonb) AS badges,COALESCE(b.total,0)::text AS category_total
			FROM (SELECT d.id,d.name,d.format,d.created_at,d.updated_at FROM decks d WHERE ${matching(accountId, query)} ORDER BY ${ordering(query)} LIMIT ${limit} OFFSET ${offset}) d
			LEFT JOIN LATERAL (SELECT sum(e.quantity)::text AS quantity,(array_agg(e.image_uri ORDER BY CASE WHEN e.role='commander' THEN 0 ELSE 1 END,e.name,e.id))[1] AS image_uri FROM deck_cards e WHERE e.deck_id=d.id AND e.account_id=${accountId}) s ON true
			LEFT JOIN LATERAL (SELECT count(*) AS total,jsonb_agg(m.badge ORDER BY m.display_order,m.version_id) FILTER(WHERE m.position<=${DECK_LIBRARY_BADGE_LIMIT}) AS badges FROM (SELECT c.display_order,c.version_id,row_number() OVER(ORDER BY c.display_order,c.version_id) AS position,jsonb_build_object('versionId',c.version_id,'originId',c.origin_id,'name',c.name,'historical', COALESCE(v.id<>c.version_id,true)) AS badge FROM deck_whole_categories c JOIN deck_whole_category_decisions w USING(deck_id,version_id) LEFT JOIN category_definition_origins o ON o.id=c.origin_id AND o.account_id=${accountId} LEFT JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE c.deck_id=d.id AND ${wholeMembership}) m) b ON true
			ORDER BY ${ordering(query)}`);
		return {
			query,
			queryKey: deckLibraryQueryKey(query),
			revision: current,
			offset,
			limit,
			matchingTotal: integer(totals.rows[0].matching_total),
			globalTotal: integer(totals.rows[0].global_total),
			items: rows.rows.map((row) => ({
				id: String(row.id),
				name: String(row.name),
				format: String(row.format),
				createdAt: new Date(String(row.created_at)).toISOString(),
				updatedAt: new Date(String(row.updated_at)).toISOString(),
				quantity: integer(row.quantity),
				imageUri: String(row.image_uri),
				categories: row.badges as DeckLibraryPage['items'][number]['categories'],
				remainingCategoryCount: Math.max(0, integer(row.category_total) - DECK_LIBRARY_BADGE_LIMIT)
			}))
		};
	});
}
export async function locateDeck(
	db: Database,
	accountId: string,
	deckId: string,
	input: DeckLibraryInput = {}
): Promise<DeckLibraryLocation> {
	assertUuid(deckId, 'deckId');
	const { query, expectedRevision } = parseDeckLibraryInput(input);
	return read(db, async (tx) => {
		const current = await revision(tx, accountId, expectedRevision);
		const rows = await tx.execute(
			sql`WITH ranked AS (SELECT d.id,row_number() OVER(ORDER BY ${ordering(query)})-1 AS position FROM decks d WHERE ${matching(accountId, query)}) SELECT count(*)::text AS total,max(position) FILTER(WHERE id=${deckId}::uuid)::text AS "offset" FROM ranked`
		);
		return {
			query,
			queryKey: deckLibraryQueryKey(query),
			revision: current,
			deckId,
			offset: rows.rows[0].offset === null ? null : integer(rows.rows[0].offset),
			matchingTotal: integer(rows.rows[0].total)
		};
	});
}
export async function readDeckLibraryCategories(
	db: Database,
	accountId: string,
	input: DeckLibraryCategoryInput = {}
): Promise<DeckLibraryCategories> {
	const { query, offset, limit, expectedRevision } = parseDeckLibraryInput(input, [
		'selectedVersionIds'
	]);
	const selected = parseDeckLibraryInput({
		categoryVersionIds: input.selectedVersionIds ?? query.categoryVersionIds
	}).query.categoryVersionIds;
	const withoutCategories = { ...query, categoryVersionIds: [] };
	return read(db, async (tx) => {
		const current = await revision(tx, accountId, expectedRevision);
		// Saved snapshots own historical meaning. Current reusable definitions add unused filter choices.
		const versions = sql`WITH versions AS (SELECT DISTINCT ON(c.version_id) c.version_id,c.origin_id,c.name,c.definition_snapshot->>'meaning' AS meaning,(c.definition_snapshot->>'version')::integer AS version FROM deck_whole_categories c JOIN decks d ON d.id=c.deck_id WHERE d.account_id=${accountId} ORDER BY c.version_id,c.deck_id), choices AS (SELECT * FROM versions UNION ALL SELECT v.id,o.id,v.definition->>'name',v.definition->>'meaning',v.version FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version WHERE o.account_id=${accountId} AND o.scope='deck' AND NOT o.archived AND NOT EXISTS(SELECT 1 FROM versions s WHERE s.version_id=v.id))`;
		const count = await tx.execute(sql`${versions} SELECT count(*)::text AS total FROM choices`);
		const fields = sql`SELECT x.*,COALESCE(v.id<>x.version_id,true) AS historical,(SELECT count(*)::text FROM decks d WHERE ${matching(accountId, withoutCategories)} AND EXISTS(SELECT 1 FROM deck_whole_categories c JOIN deck_whole_category_decisions w USING(deck_id,version_id) WHERE c.deck_id=d.id AND c.version_id=x.version_id AND ${wholeMembership})) AS count FROM choices x LEFT JOIN category_definition_origins o ON o.id=x.origin_id AND o.account_id=${accountId} LEFT JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version`;
		const rows = await tx.execute(
			sql`${versions} ${fields} ORDER BY x.name COLLATE "inventory_root",x.version_id LIMIT ${limit} OFFSET ${offset}`
		);
		const selectedRows = selected.length
			? await tx.execute(
					sql`${versions} ${fields} WHERE x.version_id IN(${sql.join(
						selected.map((id) => sql`${id}::uuid`),
						sql`, `
					)}) ORDER BY x.name COLLATE "inventory_root",x.version_id`
				)
			: { rows: [] };
		const dto = (row: Record<string, unknown>): DeckLibraryCategory => ({
			versionId: String(row.version_id),
			originId: String(row.origin_id),
			name: String(row.name),
			meaning: String(row.meaning ?? ''),
			version: integer(row.version),
			historical: row.historical === true,
			count: integer(row.count)
		});
		return {
			query,
			queryKey: deckLibraryQueryKey(query),
			revision: current,
			offset,
			limit,
			total: integer(count.rows[0].total),
			items: rows.rows.map(dto),
			selected: selectedRows.rows.map(dto)
		};
	});
}
