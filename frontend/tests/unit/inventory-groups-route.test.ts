import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../src/lib/server/mtg/validation';

const mocks = vi.hoisted(() => ({
	page: vi.fn(),
	snapshot: vi.fn(),
	groups: vi.fn(),
	create: vi.fn(),
	rename: vi.fn(),
	removeGroup: vi.fn(),
	assign: vi.fn(),
	setNames: vi.fn()
}));
vi.mock('#lib/server/data/inventory.ts', () => ({
	getInventorySnapshot: mocks.snapshot,
	removeInventoryCard: vi.fn(),
	updateInventoryCard: vi.fn(),
	InventoryQuantityChangedError: class InventoryQuantityChangedError extends Error {},
	InventoryNotFoundError: class InventoryNotFoundError extends Error {},
	NotesConflictError: class NotesConflictError extends Error {}
}));
vi.mock('#lib/server/data/inventory-groups.ts', () => ({
	getInventoryGroups: mocks.groups,
	createInventoryGroup: mocks.create,
	renameInventoryGroup: mocks.rename,
	deleteInventoryGroup: mocks.removeGroup,
	replaceInventoryGroupMemberships: mocks.assign,
	InventoryGroupNotFoundError: class InventoryGroupNotFoundError extends Error {}
}));
vi.mock('#lib/server/data/inventory-window.ts', async () => {
	const { inventoryQueryFromUrl } = await import('@spellbook/backend/inventory/query.ts');
	return { inventoryQueryFromUrl, inventoryApplication: { page: mocks.page } };
});
vi.mock('#lib/server/catalog/search.ts', () => ({ getCatalogSetNames: mocks.setNames }));
import { InventoryNotFoundError } from '../../src/lib/server/data/inventory';
import { actions, load } from '../../src/routes/mtg/inventory/+page.server';

const groupId = '1d61bd72-10b8-4f30-b76e-af51c6875557';
const entryId = 'abc7d302-77c5-4d30-8238-323821b177fe';

function event(
	url = 'https://spellbook.test/mtg/inventory',
	fields: [string, string][] = [],
	accountId: string | null = 'owner'
) {
	return {
		locals: { user: accountId ? { accountId } : null },
		url: new URL(url),
		parent: async () => ({ activeGame: 'mtg' }),
		request: new Request(url, { method: 'POST', body: new URLSearchParams(fields) })
	};
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.snapshot.mockResolvedValue({ cards: [], stats: { total: 0 }, inventory: null });
	mocks.groups.mockResolvedValue({
		groups: [{ id: groupId, name: 'Binder', entryCount: 0, quantity: 0 }],
		memberships: []
	});
	mocks.page.mockImplementation(async (_account, query) => {
		if (query.group && query.group !== groupId)
			throw new ValidationError('Inventory group not found');
		return {
			kind: 'Page',
			query,
			matching: { entryCount: 0, copyCount: 0 },
			groupCount: 1,
			entries: [],
			groups: [{ id: groupId, name: 'Binder', entryCount: 0, quantity: 0 }],
			memberships: [],
			sets: [],
			viewedAt: '2026-10-07T00:00:00Z',
			totals: { copyCount: 0, canonicalCardCount: 0, foilEntryCount: 0, setCount: 0 }
		};
	});
	mocks.setNames.mockResolvedValue({});
	mocks.create.mockResolvedValue({ groups: [{ groupId }] });
});

describe('Inventory group route boundaries', () => {
	it('requires an authenticated session for load and every action', async () => {
		await expect(load(event(undefined, [], null) as never)).rejects.toMatchObject({ status: 303 });
		for (const action of Object.values(actions)) {
			await expect(action(event(undefined, [], null) as never)).rejects.toMatchObject({
				status: 303
			});
		}
		expect(mocks.groups).not.toHaveBeenCalled();
		expect(mocks.create).not.toHaveBeenCalled();
		expect(mocks.assign).not.toHaveBeenCalled();
	});

	it('loads Cards by default and exposes the group snapshot in a batch', async () => {
		const result = await load(event() as never);
		expect(result).toMatchObject({ groupsView: false, selectedGroupId: null, memberships: [] });
		expect(result).toMatchObject({ window: { kind: 'Page' } });
	});

	it('opens the groups directory and an owned UUID detail', async () => {
		expect(
			await load(event('https://spellbook.test/mtg/inventory?view=groups') as never)
		).toMatchObject({
			groupsView: true,
			selectedGroupId: null
		});
		expect(
			await load(
				event(
					`https://spellbook.test/mtg/inventory?view=groups&group=${groupId.toUpperCase()}`
				) as never
			)
		).toMatchObject({ groupsView: true, selectedGroupId: groupId });
	});

	it.each([
		['not-a-uuid', 400],
		['', 400],
		['8b707e20-8d7d-4b74-b253-df03ffb106cf', 404]
	])('rejects missing or foreign group selection %s', async (id, status) => {
		await expect(
			load(event(`https://spellbook.test/mtg/inventory?view=groups&group=${id}`) as never)
		).rejects.toMatchObject({ status });
	});

	it('translates browser pagination before read and clamps a deep page once using complete counts', async () => {
		mocks.page.mockImplementation(async (_actor, query) => ({
			kind: 'Page',
			query,
			matching: { entryCount: 1200, copyCount: 1200 },
			groupCount: 1
		}));
		await expect(
			load(event('https://spellbook.test/mtg/inventory?page=999&pageSize=500&finish=foil') as never)
		).rejects.toMatchObject({
			status: 307,
			location: '/mtg/inventory?page=3&pageSize=500&finish=foil'
		});
		expect(mocks.page).toHaveBeenCalledOnce();
		expect(mocks.page.mock.calls[0][1]).toMatchObject({
			offset: 499000,
			limit: 500,
			finish: 'foil'
		});
	});

	it('takes the account and game from the server for CRUD', async () => {
		const fields: [string, string][] = [
			['accountId', 'forged'],
			['game', 'forged'],
			['name', 'Draft name'],
			['groupId', groupId]
		];
		expect(await actions.createGroup(event(undefined, fields) as never)).toEqual({
			success: true,
			groupId,
			acknowledgement: { groups: [{ groupId }] }
		});
		await actions.renameGroup(event(undefined, fields) as never);
		await actions.deleteGroup(event(undefined, fields) as never);
		expect(mocks.create).toHaveBeenCalledWith(
			{ accountId: 'owner' },
			{ requestId: '', name: 'Draft name' }
		);
		expect(mocks.rename).toHaveBeenCalledWith(
			{ accountId: 'owner' },
			{ requestId: '', groupId, name: 'Draft name' }
		);
		expect(mocks.removeGroup).toHaveBeenCalledWith(
			{ accountId: 'owner' },
			{ requestId: '', groupId }
		);
	});

	it('passes repeated selections and empty selections as full replacements', async () => {
		await actions.assignGroups(
			event(undefined, [
				['entryId', entryId],
				['groupId', groupId],
				['groupId', 'second']
			]) as never
		);
		expect(mocks.assign).toHaveBeenLastCalledWith(
			{ accountId: 'owner' },
			{ requestId: '', entryId, groupIds: [groupId, 'second'] }
		);
		await actions.assignGroups(event(undefined, [['entryId', entryId]]) as never);
		expect(mocks.assign).toHaveBeenLastCalledWith(
			{ accountId: 'owner' },
			{ requestId: '', entryId, groupIds: [] }
		);
	});

	it('returns validation and ownership failures as form failures', async () => {
		mocks.create.mockRejectedValue(new ValidationError('A group with this name already exists'));
		expect(await actions.createGroup(event() as never)).toMatchObject({
			status: 400,
			data: { message: 'A group with this name already exists' }
		});
		mocks.assign.mockRejectedValue(new InventoryNotFoundError('Inventory group not found'));
		expect(await actions.assignGroups(event() as never)).toMatchObject({
			status: 404,
			data: { message: 'Inventory group not found' }
		});
	});

	it('redirects a selected deleted group to the directory', async () => {
		await expect(
			actions.deleteGroup(
				event(`https://spellbook.test/mtg/inventory?view=groups&group=${groupId}&/deleteGroup`, [
					['groupId', groupId]
				]) as never
			)
		).rejects.toMatchObject({ status: 303, location: '/mtg/inventory?view=groups&page=1' });
	});

	it('does not report unexpected database errors as validation success', async () => {
		mocks.assign.mockRejectedValue(new Error('Database unavailable'));
		await expect(actions.assignGroups(event() as never)).rejects.toThrow('Database unavailable');
	});
});

it('retains exactly one 500-entry SSR array instead of an unused legacy projection', async () => {
	const entries = Array.from({ length: 500 }, (_, index) => ({
		id: String(index),
		createdAt: '2026-10-07T00:00:00Z',
		updatedAt: '2026-10-07T00:00:00Z'
	}));
	const page = {
		...(await mocks.page('owner', { view: 'cards' })),
		entries,
		matching: { entryCount: 500, copyCount: 500 }
	};
	mocks.page.mockResolvedValue(page);
	const result = await load(event('https://spellbook.test/mtg/inventory?pageSize=500') as never);
	if (!result) throw new Error('Expected Inventory server data.');
	expect(result.window).toBe(page);
	expect(result.window.entries).toBe(entries);
	expect(result).not.toHaveProperty('cards');
});
