import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createDatabase, createLocalAuth } from '@spellbook/backend';
import { createInventory } from '@spellbook/backend/inventory/read.ts';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
	createInventoryMutations,
	InventoryQuantityChangedError
} from '@spellbook/backend/inventory/mutations.ts';
import { createCatalog } from '@spellbook/backend/catalog/search.ts';
import { ensureInventory } from '@spellbook/backend/inventory/write.ts';
const run = process.env.TEST_DATABASE_URL ? describe : describe.skip;
run('consistent authorized Inventory windows', () => {
	let account: string = randomUUID(),
		foreign: string = randomUUID();
	let actor: import('@spellbook/contracts/auth.ts').AuthUser,
		foreignActor: import('@spellbook/contracts/auth.ts').AuthUser;
	let database: ReturnType<typeof createDatabase>, inventory: ReturnType<typeof createInventory>;
	let mutations: ReturnType<typeof createInventoryMutations>;
	beforeAll(async () => {
		database = createDatabase(process.env.TEST_DATABASE_URL!);
		const auth = createLocalAuth(database.db, { demoMode: false });
		inventory = createInventory(database.pool, auth);
		mutations = createInventoryMutations(database.db, createCatalog(database.pool), auth);
		const first = await auth.authenticate(
			'register',
			'iw_' + account.slice(0, 8),
			'window-test-password'
		);
		const second = await auth.authenticate(
			'register',
			'iw_' + foreign.slice(0, 8),
			'window-test-password'
		);
		if (!first || !second) throw Error('Account fixture failed');
		actor = first.user;
		foreignActor = second.user;
		account = actor.accountId;
		foreign = foreignActor.accountId;
	});
	afterAll(async () => {
		await database.pool.query('DELETE FROM user_profiles WHERE account_id=ANY($1)', [
			[account, foreign]
		]);
		await database.pool.end();
	});
	const ownerActor = (owner: string) => (owner === account ? actor : foreignActor);
	async function createInventoryGroup(owner: string, name: string) {
		const ack = await mutations.createGroup(ownerActor(owner), { requestId: randomUUID(), name });
		return { id: ack.groups[0].groupId };
	}
	const renameInventoryGroup = (owner: string, groupId: string, name: string) =>
		mutations.renameGroup(ownerActor(owner), { requestId: randomUUID(), groupId, name });
	const deleteInventoryGroup = (owner: string, groupId: string) =>
		mutations.deleteGroup(ownerActor(owner), { requestId: randomUUID(), groupId });
	const replaceInventoryGroupMemberships = (owner: string, entryId: string, groupIds: string[]) =>
		mutations.replaceMemberships(ownerActor(owner), { requestId: randomUUID(), entryId, groupIds });
	const reorderInventoryCard = (owner: string, entryId: string, position: number) =>
		mutations.reorder(ownerActor(owner), { requestId: randomUUID(), entryId, position });
	const removeInventoryCard = (owner: string, entryId: string, expectedQuantity: number) =>
		mutations.remove(ownerActor(owner), { requestId: randomUUID(), entryId, expectedQuantity });
	// Deliberately synthetic reader fixtures exercise literal search and aggregate math, independently of Catalog mutation validation.
	async function seedReaderEntries(
		owner: string,
		input: {
			operations: Array<{
				card: {
					catalogCardId: string;
					canonicalCardId: string;
					name: string;
					setCode: string;
					imageUri: string;
				};
				quantity: number;
				finish: string;
				condition: string;
			}>;
			requestId: string;
			game: string;
			source: string;
		}
	) {
		const parent = await ensureInventory(database.db, owner, 'mtg');
		for (let position = 0; position < input.operations.length; position++) {
			const op = input.operations[position];
			await database.pool.query(
				'INSERT INTO inventory_cards(id,account_id,inventory_id,game,catalog_card_id,canonical_card_id,name,set_code,image_uri,quantity,finish,condition,spellbook_position)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
				[
					randomUUID(),
					owner,
					parent.id,
					'mtg',
					op.card.catalogCardId,
					op.card.canonicalCardId,
					op.card.name,
					op.card.setCode,
					op.card.imageUri,
					op.quantity,
					op.finish,
					op.condition,
					position
				]
			);
		}
	}

	it('returns bounded entries, complete metrics and literal search, rejects mixed revisions', async () => {
		await seedReaderEntries(account, {
			requestId: randomUUID(),
			game: 'mtg',
			source: 'web',
			operations: Array.from({ length: 120 }, (_, i) => ({
				card: {
					catalogCardId: `card-${i}`,
					canonicalCardId: `oracle-${i % 60}`,
					name: i === 5 ? '100%_ literal' : `Card ${String(i).padStart(3, '0')}`,
					setCode: i % 2 ? 'abc' : 'xyz',
					imageUri: ''
				},
				quantity: 2,
				finish: i % 2 ? 'foil' : 'nonfoil',
				condition: 'NM'
			}))
		});
		const page = await inventory.page(actor, {});
		if (page.kind !== 'Page') throw Error('Expected page');
		await expect(inventory.page({ ...actor }, {})).rejects.toMatchObject({
			kind: 'Unauthenticated'
		});
		expect(page.entries).toHaveLength(50);
		expect(page.totals).toEqual({
			entryCount: 120,
			copyCount: 240,
			canonicalCardCount: 60,
			foilEntryCount: 60,
			setCount: 2
		});
		expect(page.matching).toEqual({ entryCount: 120, copyCount: 240 });
		const literal = await inventory.page(actor, { q: '%_' });
		expect(literal.kind === 'Page' && literal.entries.map((e) => e.name)).toEqual([
			'100%_ literal'
		]);
		const detail = await inventory.getEntry(actor, page.entries[0].id);
		expect(detail?.entry.id).toBe(page.entries[0].id);
		expect(await inventory.getEntry(foreignActor, page.entries[0].id)).toBeNull();
		expect(await inventory.locate(actor, {}, page.entries[0].id, page.revision)).toEqual({
			kind: 'Location',
			revision: page.revision,
			index: 0
		});
		const group = await createInventoryGroup(account, 'Shared');
		await replaceInventoryGroupMemberships(account, page.entries[0].id, [group.id]);
		const changed = await inventory.page(actor, { offset: 50 }, page.revision);
		expect(changed.kind).toBe('RevisionChanged');
		const grouped = await inventory.page(actor, { group: group.id });
		if (grouped.kind !== 'Page') throw Error('Expected page');
		expect(grouped.entries).toHaveLength(1);
		expect(grouped.groups[0]).toMatchObject({ entryCount: 1, quantity: 2 });
		const before = grouped.revision;
		await renameInventoryGroup(account, group.id, 'Shared');
		await replaceInventoryGroupMemberships(account, page.entries[0].id, [group.id]);
		expect((await inventory.page(actor, {})).revision).toBe(before);
		await reorderInventoryCard(account, page.entries[0].id, 119);
		expect((await inventory.page(actor, {})).revision).not.toBe(before);
		await deleteInventoryGroup(account, group.id);
		const current = await inventory.getEntry(actor, page.entries[0].id);
		if (!current) throw Error('Expected entry');
		await expect(
			removeInventoryCard(account, current.entry.id, current.entry.quantity + 1)
		).rejects.toBeInstanceOf(InventoryQuantityChangedError);
		expect((await inventory.getEntry(actor, current.entry.id))?.entry.quantity).toBe(
			current.entry.quantity
		);
	});
	it('keeps full set names and progress independent of relevant entry filters', async () => {
		await seedReaderEntries(account, {
			requestId: randomUUID(),
			game: 'mtg',
			source: 'web',
			operations: [
				{
					card: {
						catalogCardId: randomUUID(),
						canonicalCardId: randomUUID(),
						name: 'Missing Catalog set',
						setCode: 'missing',
						imageUri: ''
					},
					quantity: 1,
					finish: 'nonfoil',
					condition: 'NM'
				}
			]
		});
		const prior = (
			await database.pool.query('SELECT active_generation FROM catalog_state WHERE id=1')
		).rows[0]?.active_generation;
		const generation = randomUUID(),
			inactiveGeneration = randomUUID();
		const docs: CardDocument[] = JSON.parse(
			await readFile(new URL('../../scripts/demo/cards.json', import.meta.url), 'utf8')
		);
		try {
			await database.pool.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at)VALUES($1,'query-contract-test',now(),4,now())",
				[generation]
			);
			await database.pool.query(
				"INSERT INTO catalog_generations(id,source_type,source_updated_at,document_count,published_at)VALUES($1,'inactive-query-contract-test',now(),1,now())",
				[inactiveGeneration]
			);
			for (let i = 0; i < 4; i++) {
				const d = {
					...docs[i],
					id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
					set_code: i === 3 ? 'xyz' : 'abc',
					set_name: ['   ', 'Later by name, first by UUID', 'Alphabetically first', '   '][i]
				};
				await database.pool.query(
					`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document)VALUES($1,$2,$3,$4,$4,'','en',$5,'1','common',0,'{}','{}','{}',$4,$4,$6)`,
					[generation, d.id, d.oracle_id, d.name, d.set_code, JSON.stringify(d)]
				);
				if (i === 0)
					await database.pool.query(
						`INSERT INTO catalog_printings(generation_id,id,oracle_id,name,normalized_name,printed_name,lang,set_code,collector_number,rarity,cmc,colors,card_types,legalities,search_name,search_text,document) SELECT $1::uuid, id, oracle_id, name, normalized_name, printed_name, lang, set_code, collector_number, rarity, cmc, colors, card_types, legalities, search_name, search_text, jsonb_set(document,'{set_name}','"Inactive generation name"'::jsonb) FROM catalog_printings WHERE generation_id=$2 AND id=$3`,
						[inactiveGeneration, generation, d.id]
					);
			}
			await database.pool.query(
				'INSERT INTO catalog_state(id,active_generation)VALUES(1,$1)ON CONFLICT(id)DO UPDATE SET active_generation=excluded.active_generation',
				[generation]
			);
			const result = await inventory.page(actor, {
				sets: ['abc'],
				q: 'no match',
				finish: 'nonfoil',
				condition: 'DMG'
			});
			if (result.kind !== 'Page') throw Error('Expected Page');
			expect(result.entries).toHaveLength(0);
			expect(result.sets).toEqual([
				{ code: 'abc', name: 'Later by name, first by UUID' },
				{ code: 'missing', name: 'MISSING' },
				{ code: 'xyz', name: 'XYZ' }
			]);
			expect(result.setProgress).toMatchObject({
				setCode: 'abc',
				ownedCanonicalCount: 30,
				catalogCanonicalCount: new Set(docs.slice(0, 3).map((d) => d.oracle_id)).size
			});
			const sorted = await inventory.page(actor, {
				sort: 'set',
				dir: 'desc',
				variant: 'quantity',
				variantDir: 'desc'
			});
			if (sorted.kind !== 'Page') throw Error('Expected Page');
			expect(sorted.entries.every((e) => e.setCode === 'xyz')).toBe(true);
			await database.pool.query(
				`UPDATE catalog_printings SET document=jsonb_set(document,'{set_name}','"First UUID wins"'::jsonb) WHERE generation_id=$1 AND id='00000000-0000-4000-8000-000000000001'`,
				[generation]
			);
			const named = await inventory.page(actor, {});
			if (named.kind !== 'Page') throw Error('Expected Page');
			expect(named.sets.find((set) => set.code === 'abc')?.name).toBe('First UUID wins');
			await database.pool.query('UPDATE catalog_state SET active_generation=NULL WHERE id=1');
			const absent = await inventory.page(actor, {});
			if (absent.kind !== 'Page') throw Error('Expected Page');
			expect(absent.sets).toEqual([
				{ code: 'abc', name: 'ABC' },
				{ code: 'missing', name: 'MISSING' },
				{ code: 'xyz', name: 'XYZ' }
			]);
		} finally {
			await database.pool.query('UPDATE catalog_state SET active_generation=$1 WHERE id=1', [
				prior ?? null
			]);
			await database.pool.query('DELETE FROM catalog_generations WHERE id=ANY($1::uuid[])', [
				[generation, inactiveGeneration]
			]);
		}
	});
	it('preserves large copy sums across matching global and overlapping group totals', async () => {
		await seedReaderEntries(foreign, {
			requestId: randomUUID(),
			game: 'mtg',
			source: 'web',
			operations: [0, 1].map((i) => ({
				card: {
					catalogCardId: randomUUID(),
					canonicalCardId: randomUUID(),
					name: `Large count ${i}`,
					setCode: 'large',
					imageUri: ''
				},
				quantity: 2147483647,
				finish: 'nonfoil',
				condition: 'NM'
			}))
		});
		const initial = await inventory.page(foreignActor, {});
		if (initial.kind !== 'Page') throw Error('Expected Page');
		const group = await createInventoryGroup(foreign, 'Large copies');
		for (const entry of initial.entries)
			await replaceInventoryGroupMemberships(foreign, entry.id, [group.id]);
		const result = await inventory.page(foreignActor, { group: group.id });
		if (result.kind !== 'Page') throw Error('Expected Page');
		expect(result.matching).toEqual({ entryCount: 2, copyCount: 4294967294 });
		expect(result.totals.copyCount).toBe(4294967294);
		expect(result.groups.find((g) => g.id === group.id)).toMatchObject({
			entryCount: 2,
			quantity: 4294967294
		});
	});
});
