import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Database, Transaction } from '../../../backend/src/db/client.ts';
import {
	readDeckLibrary,
	locateDeck,
	readDeckLibraryCategories,
	DeckLibraryRevisionChanged
} from '../../../backend/src/decks/library.ts';

const dialect = new PgDialect();
function reader(results: Record<string, unknown>[][]) {
	const queries: ReturnType<PgDialect['sqlToQuery']>[] = [];
	const settings: unknown[] = [];
	const db = {
		transaction: async (operation: (tx: Transaction) => Promise<unknown>, options: unknown) => {
			settings.push(options);
			return operation({
				execute: async (query: SQL) => {
					queries.push(dialect.sqlToQuery(query));
					return { rows: results.shift() ?? [] };
				}
			} as Transaction);
		}
	} as Database;
	return { db, queries, settings };
}
const id = '11111111-1111-4111-8111-111111111111';
describe('Deck Library read transaction seam', () => {
	it('reads revision zero without provisioning and stops before stale page reads', async () => {
		const fixture = reader([[]]);
		await expect(
			readDeckLibrary(fixture.db, 'account', { expectedRevision: '1' })
		).rejects.toMatchObject({ kind: 'RevisionChanged', revision: '0' });
		expect(fixture.queries).toHaveLength(1);
		expect(fixture.queries[0].sql).toMatch(/^SELECT revision/);
		expect(fixture.settings).toEqual([
			{ isolationLevel: 'repeatable read', accessMode: 'read only' }
		]);
		expect(new DeckLibraryRevisionChanged('3').revision).toBe('3');
	});
	it('returns only compact metadata and preserves the full remaining badge count', async () => {
		const fixture = reader([
			[],
			[{ global_total: '1001', matching_total: '501' }],
			[
				{
					id,
					name: 'Deck',
					format: 'Commander',
					created_at: '2026-10-08',
					updated_at: '2026-10-08',
					quantity: '100',
					image_uri: 'image',
					badges: [{ versionId: id, originId: id, name: 'Draw', historical: true }],
					category_total: '4'
				}
			]
		]);
		const page = await readDeckLibrary(fixture.db, 'account', {
			limit: 200,
			offset: 800,
			categoryVersionIds: [id],
			format: 'Commander'
		});
		expect(page).toMatchObject({
			revision: '0',
			globalTotal: 1001,
			matchingTotal: 501,
			limit: 200,
			offset: 800
		});
		expect(page.items[0].remainingCategoryCount).toBe(1);
		expect(Object.keys(page.items[0])).not.toContain('definition_snapshot');
		expect(fixture.queries.every((query) => !/INSERT|UPDATE|DELETE/.test(query.sql))).toBe(true);
		expect(fixture.queries[2].params).toContain(200);
	});
	it('uses the identical normalized query and sort for location and page reads', async () => {
		const query = { query: '  100%_  ', sort: 'name:desc' as const, categoryVersionIds: [id] };
		const pageReader = reader([[], [{ global_total: '3', matching_total: '2' }], []]);
		const locationReader = reader([[], [{ total: '2', offset: null }]]);
		const page = await readDeckLibrary(pageReader.db, 'account', query);
		const location = await locateDeck(locationReader.db, 'account', id, query);
		expect(location.queryKey).toBe(page.queryKey);
		expect(location.offset).toBeNull();
		for (const fixture of [pageReader, locationReader]) {
			const sql = fixture.queries.at(-1)!;
			expect(sql.sql).toContain('d.name COLLATE "inventory_root" DESC, d.id');
			expect(sql.params).toContain('%100\\%\\_%');
		}
	});
	it('bounds the options page and fetches selected immutable versions separately', async () => {
		const fixture = reader([
			[{ revision: '2' }],
			[{ total: '500' }],
			[],
			[
				{
					version_id: id,
					origin_id: id,
					name: 'Draw',
					meaning: 'Saved meaning',
					version: 1,
					historical: true,
					count: '2'
				}
			]
		]);
		const result = await readDeckLibraryCategories(fixture.db, 'account', {
			limit: 20,
			selectedVersionIds: [id],
			expectedRevision: '2'
		});
		expect(result).toMatchObject({
			revision: '2',
			total: 500,
			items: [],
			selected: [{ versionId: id, meaning: 'Saved meaning', historical: true, count: 2 }]
		});
		expect(fixture.queries[2].params).toContain(20);
		expect(fixture.queries[3].params).toContain(id);
	});
});
