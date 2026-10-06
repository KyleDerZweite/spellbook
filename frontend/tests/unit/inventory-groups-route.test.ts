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
	updateInventoryCard: vi.fn()
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
import { InventoryGroupNotFoundError } from '../../src/lib/server/data/inventory-groups';
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
			entries: [],
			groups: [{ id: groupId, name: 'Binder', entryCount: 0, quantity: 0 }],
			memberships: [],
			sets: [],
			viewedAt: '2026-10-07T00:00:00Z',
			totals: { copyCount: 0, canonicalCardCount: 0, foilEntryCount: 0, setCount: 0 }
		};
	});
	mocks.setNames.mockResolvedValue({});
	mocks.create.mockResolvedValue({ id: groupId });
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
		expect(result).toMatchObject({ cards: [], window: { kind: 'Page' } });
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

	it('takes the account and game from the server for CRUD', async () => {
		const fields: [string, string][] = [
			['accountId', 'forged'],
			['game', 'forged'],
			['name', 'Draft name'],
			['groupId', groupId]
		];
		expect(await actions.createGroup(event(undefined, fields) as never)).toEqual({
			success: true,
			groupId
		});
		await actions.renameGroup(event(undefined, fields) as never);
		await actions.deleteGroup(event(undefined, fields) as never);
		expect(mocks.create).toHaveBeenCalledWith('owner', 'Draft name', 'mtg');
		expect(mocks.rename).toHaveBeenCalledWith('owner', groupId, 'Draft name', 'mtg');
		expect(mocks.removeGroup).toHaveBeenCalledWith('owner', groupId, 'mtg');
	});

	it('passes repeated selections and empty selections as full replacements', async () => {
		await actions.assignGroups(
			event(undefined, [
				['entryId', entryId],
				['groupId', groupId],
				['groupId', 'second']
			]) as never
		);
		expect(mocks.assign).toHaveBeenLastCalledWith('owner', entryId, [groupId, 'second'], 'mtg');
		await actions.assignGroups(event(undefined, [['entryId', entryId]]) as never);
		expect(mocks.assign).toHaveBeenLastCalledWith('owner', entryId, [], 'mtg');
	});

	it('returns validation and ownership failures as form failures', async () => {
		mocks.create.mockRejectedValue(new ValidationError('A group with this name already exists'));
		expect(await actions.createGroup(event() as never)).toMatchObject({
			status: 400,
			data: { message: 'A group with this name already exists' }
		});
		mocks.assign.mockRejectedValue(new InventoryGroupNotFoundError('Inventory group not found'));
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
		).rejects.toMatchObject({ status: 303, location: '/mtg/inventory?view=groups' });
	});

	it('does not report unexpected database errors as validation success', async () => {
		mocks.assign.mockRejectedValue(new Error('Database unavailable'));
		await expect(actions.assignGroups(event() as never)).rejects.toThrow('Database unavailable');
	});
});
