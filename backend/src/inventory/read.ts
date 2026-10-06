import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { createLocalAuth } from '../auth/local.ts';
import type { Pool, PoolClient } from 'pg';
import type {
	InventoryApplication,
	InventoryEntry,
	InventoryGroupCount,
	InventoryPage,
	InventoryQuery,
	RevisionChanged
} from '@spellbook/contracts/inventory.ts';
import { normalizeInventoryQuery, inventoryQueryKey } from './query.ts';
import { databaseInteger, DatabaseIntegerRangeError } from '../db/numbers.ts';
import { ValidationError } from '../mtg/validation.ts';
class InventoryCountError extends Error {
	readonly kind = 'InvalidInventoryCount';
	constructor() {
		super('Inventory totals cannot be represented exactly.');
	}
}
function count(value: unknown) {
	try {
		const result = databaseInteger(value);
		if (result < 0) throw new DatabaseIntegerRangeError();
		return result;
	} catch (cause) {
		if (cause instanceof DatabaseIntegerRangeError) throw new InventoryCountError();
		throw cause;
	}
}
const uuid = (value: string) => {
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))
		throw new ValidationError('entryId must be a UUID');
	return value.toLowerCase();
};
function revision(value: string | undefined) {
	if (value !== undefined && !/^(0|[1-9][0-9]*)$/.test(value))
		throw new ValidationError('Invalid Inventory revision');
}
const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
function entry(row: Record<string, unknown>): InventoryEntry {
	return {
		id: String(row.id),
		accountId: String(row.account_id),
		inventoryId: String(row.inventory_id),
		game: String(row.game),
		catalogCardId: String(row.catalog_card_id),
		canonicalCardId: String(row.canonical_card_id),
		name: String(row.name),
		setCode: String(row.set_code),
		imageUri: String(row.image_uri),
		quantity: Number(row.quantity),
		finish: String(row.finish),
		condition: String(row.condition),
		notes: String(row.notes),
		notesRevision: String(row.notes_revision),
		spellbookPosition: Number(row.spellbook_position),
		createdAt: (row.created_at as Date).toISOString(),
		updatedAt: (row.updated_at as Date).toISOString()
	};
}
function selection(query: InventoryQuery, inventoryId: string | null, accountId: string) {
	const values: unknown[] = [inventoryId, accountId];
	const bind = (value: unknown) => {
		values.push(value);
		return `$${values.length}`;
	};
	const where = ["c.inventory_id=$1 AND c.account_id=$2 AND c.game='mtg'"];
	if (query.q) {
		const q = bind(`%${literal(query.q.toLowerCase())}%`);
		where.push(
			`(lower(c.name) LIKE ${q} OR lower(c.set_code) LIKE ${q} OR lower(c.condition) LIKE ${q} OR lower(c.notes) LIKE ${q})`
		);
	}
	if (query.sets.length) where.push(`lower(c.set_code)=ANY(${bind(query.sets)}::text[])`);
	if (query.finish !== 'all') where.push(`c.finish=${bind(query.finish)}`);
	if (query.condition !== 'all') where.push(`c.condition=${bind(query.condition)}`);
	if (query.group)
		where.push(
			`EXISTS(SELECT 1 FROM inventory_group_memberships m WHERE m.entry_id=c.id AND m.group_id=${bind(query.group)}::uuid)`
		);
	const finish = "CASE c.finish WHEN 'nonfoil' THEN 0 ELSE 1 END",
		condition =
			"CASE c.condition WHEN 'NM' THEN 0 WHEN 'LP' THEN 1 WHEN 'MP' THEN 2 WHEN 'HP' THEN 3 ELSE 4 END";
	const tie = `c.catalog_card_id COLLATE "C",${finish},${condition},c.id`;
	const variant = query.variant
		? `${query.variant === 'finish' ? finish : query.variant === 'condition' ? condition : 'c.quantity'} ${query.variantDir},`
		: '';
	const order =
		query.sort === 'newest'
			? `c.created_at DESC,${tie}`
			: query.sort === 'set'
				? `c.set_code COLLATE "inventory_root" ${query.dir},${variant}c.name COLLATE "inventory_root",${tie}`
				: `${variant}c.name COLLATE "inventory_root" ${query.dir},c.set_code COLLATE "inventory_root",${tie}`;
	return { values, where: where.join(' AND '), order };
}
export function createInventory(
	pool: Pool,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
): InventoryApplication {
	async function snapshot<T>(
		accountId: string,
		operation: (
			client: PoolClient,
			inventoryId: string | null,
			currentRevision: string
		) => Promise<T>
	): Promise<T> {
		const client = await pool.connect();
		try {
			await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
			const { rows } = await client.query<{ id: string; revision: string }>(
				"SELECT id,revision::text FROM inventories WHERE account_id=$1 AND game='mtg'",
				[accountId]
			);
			const result = await operation(client, rows[0]?.id ?? null, rows[0]?.revision ?? '0');
			await client.query('COMMIT');
			return result;
		} catch (cause) {
			await client.query('ROLLBACK');
			throw cause;
		} finally {
			client.release();
		}
	}
	async function validateGroup(
		client: PoolClient,
		inventoryId: string | null,
		query: InventoryQuery
	) {
		if (
			query.group &&
			!(
				await client.query('SELECT id FROM inventory_groups WHERE id=$1 AND inventory_id=$2', [
					query.group,
					inventoryId
				])
			).rowCount
		)
			throw new ValidationError('Inventory group not found');
	}
	async function page(
		actor: AuthUser,
		input: unknown,
		expectedRevision?: string
	): Promise<InventoryPage | RevisionChanged> {
		const { accountId } = await auth.requireActor(actor);
		const query = normalizeInventoryQuery(input);
		revision(expectedRevision);
		return snapshot(accountId, async (client, inventoryId, currentRevision) => {
			if (expectedRevision !== undefined && expectedRevision !== currentRevision)
				return { kind: 'RevisionChanged', revision: currentRevision };
			await validateGroup(client, inventoryId, query);
			const selected = selection(query, inventoryId, accountId);
			const rows = await client.query(
				`SELECT c.* FROM inventory_cards c WHERE ${selected.where} ORDER BY ${selected.order} LIMIT $${selected.values.length + 1} OFFSET $${selected.values.length + 2}`,
				[...selected.values, query.limit, query.offset]
			);
			const entries = rows.rows.map(entry);
			const {
				rows: [matchingRow]
			} = await client.query<{ entryCount: string; copyCount: string }>(
				`SELECT count(*)::text AS "entryCount",COALESCE(sum(c.quantity),0)::text AS "copyCount" FROM inventory_cards c WHERE ${selected.where}`,
				selected.values
			);
			const {
				rows: [totalsRow]
			} = await client.query<Record<keyof InventoryPage['totals'], string>>(
				`SELECT count(*)::text AS "entryCount",COALESCE(sum(quantity),0)::text AS "copyCount",count(DISTINCT canonical_card_id COLLATE "C")::text AS "canonicalCardCount",count(*) FILTER(WHERE finish='foil')::text AS "foilEntryCount",count(DISTINCT set_code COLLATE "C")::text AS "setCount" FROM inventory_cards WHERE inventory_id=$1 AND account_id=$2 AND game='mtg'`,
				[inventoryId, accountId]
			);
			const { rows: groupRows } = await client.query<{
				id: string;
				name: string;
				entryCount: string;
				quantity: string;
			}>(
				`SELECT g.id,g.name,count(c.id)::text AS "entryCount",COALESCE(sum(c.quantity),0)::text AS quantity FROM inventory_groups g LEFT JOIN inventory_group_memberships m ON m.group_id=g.id LEFT JOIN inventory_cards c ON c.id=m.entry_id AND c.inventory_id=g.inventory_id AND c.account_id=$2 AND c.game='mtg' WHERE g.inventory_id=$1 GROUP BY g.id ORDER BY g.name COLLATE "inventory_root",g.id`,
				[inventoryId, accountId]
			);
			const matching = {
				entryCount: count(matchingRow.entryCount),
				copyCount: count(matchingRow.copyCount)
			};
			const totals = {
				entryCount: count(totalsRow.entryCount),
				copyCount: count(totalsRow.copyCount),
				canonicalCardCount: count(totalsRow.canonicalCardCount),
				foilEntryCount: count(totalsRow.foilEntryCount),
				setCount: count(totalsRow.setCount)
			};
			const groups: InventoryGroupCount[] = groupRows.map((row) => ({
				...row,
				entryCount: count(row.entryCount),
				quantity: count(row.quantity)
			}));
			const { rows: memberships } = await client.query<{
				entryId: string;
				groupId: string;
			}>(
				`SELECT m.entry_id AS "entryId",m.group_id AS "groupId" FROM inventory_group_memberships m JOIN inventory_groups g ON g.id=m.group_id WHERE g.inventory_id=$1 AND m.entry_id=ANY($2::uuid[]) ORDER BY m.entry_id,m.group_id`,
				[inventoryId, entries.map((e) => e.id)]
			);
			const { rows: sets } = await client.query<{ code: string; name: string }>(
				`WITH owned AS (SELECT DISTINCT lower(set_code) COLLATE "C" AS code FROM inventory_cards WHERE inventory_id=$1 AND account_id=$2 AND game='mtg'), active AS MATERIALIZED (SELECT active_generation AS id FROM catalog_state WHERE id=1) SELECT o.code,COALESCE((SELECT NULLIF(btrim(p.document->>'set_name'),'') FROM catalog_printings p JOIN active a ON a.id=p.generation_id WHERE p.set_code=o.code COLLATE "default" ORDER BY p.id LIMIT 1),(SELECT NULLIF(btrim(p.document->>'set_name'),'') FROM catalog_printings p JOIN active a ON a.id=p.generation_id WHERE p.set_code=o.code COLLATE "default" AND NULLIF(btrim(p.document->>'set_name'),'') IS NOT NULL ORDER BY p.id LIMIT 1),upper(o.code)) AS name FROM owned o ORDER BY o.code COLLATE "inventory_root"`,
				[inventoryId, accountId]
			);
			let setProgress: InventoryPage['setProgress'] = null;
			if (query.sets.length === 1) {
				const {
					rows: [progress]
				} = await client.query<{
					ownedCanonicalCount: string;
					catalogCanonicalCount: string;
				}>(
					`SELECT (SELECT count(DISTINCT canonical_card_id COLLATE "C")::text FROM inventory_cards WHERE inventory_id=$1 AND lower(set_code)=$2 AND account_id=$3 AND game='mtg') AS "ownedCanonicalCount",(SELECT count(DISTINCT p.oracle_id)::text FROM catalog_printings p JOIN catalog_state s ON s.id=1 AND s.active_generation=p.generation_id WHERE p.set_code=$2) AS "catalogCanonicalCount"`,
					[inventoryId, query.sets[0], accountId]
				);
				setProgress = {
					setCode: query.sets[0],
					ownedCanonicalCount: count(progress.ownedCanonicalCount),
					catalogCanonicalCount: count(progress.catalogCanonicalCount)
				};
			}
			const directory = groups.filter(
				(g) => !query.q || g.name.toLowerCase().includes(query.q.toLowerCase())
			);
			return {
				kind: 'Page',
				query,
				queryKey: inventoryQueryKey(query),
				revision: currentRevision,
				entries,
				memberships,
				groups,
				groupPage: directory.slice(query.offset, query.offset + query.limit),
				groupCount: directory.length,
				matching,
				totals,
				sets,
				setProgress,
				viewedAt: new Date().toISOString()
			};
		});
	}
	async function getEntry(actor: AuthUser, entryId: string) {
		const { accountId } = await auth.requireActor(actor);
		const id = uuid(entryId);
		return snapshot(accountId, async (client, inventoryId, currentRevision) => {
			const { rows } = await client.query(
				"SELECT * FROM inventory_cards WHERE id=$1 AND inventory_id=$2 AND account_id=$3 AND game='mtg'",
				[id, inventoryId, accountId]
			);
			if (!rows[0]) return null;
			const memberships = await client.query<{ group_id: string }>(
				'SELECT m.group_id FROM inventory_group_memberships m JOIN inventory_groups g ON g.id=m.group_id WHERE m.entry_id=$1 AND g.inventory_id=$2 ORDER BY m.group_id',
				[id, inventoryId]
			);
			return {
				entry: entry(rows[0]),
				memberships: memberships.rows.map((m) => m.group_id),
				revision: currentRevision
			};
		});
	}
	async function locate(
		actor: AuthUser,
		input: unknown,
		entryId: string,
		expectedRevision: string
	) {
		const { accountId } = await auth.requireActor(actor);
		const query = normalizeInventoryQuery(input),
			id = uuid(entryId);
		revision(expectedRevision);
		return snapshot(accountId, async (client, inventoryId, currentRevision) => {
			if (expectedRevision !== currentRevision)
				return { kind: 'RevisionChanged' as const, revision: currentRevision };
			await validateGroup(client, inventoryId, query);
			const selected = selection(query, inventoryId, accountId);
			const { rows } = await client.query<{ index: string }>(
				`SELECT position::text AS index FROM (SELECT c.id,row_number() OVER(ORDER BY ${selected.order})-1 AS position FROM inventory_cards c WHERE ${selected.where}) ordered WHERE id=$${selected.values.length + 1}`,
				[...selected.values, id]
			);
			return {
				kind: 'Location' as const,
				revision: currentRevision,
				index: rows[0] ? count(rows[0].index) : null
			};
		});
	}
	return { page, getEntry, locate };
}
