import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock('../../src/lib/server/data/dashboard.ts', () => ({ getDashboard: mocks.dashboard }));
import { load } from '../../src/routes/mtg/dashboard/+page.server';
beforeEach(() => vi.clearAllMocks());
describe('private dashboard loader', () => {
	it('queries only the authenticated account', async () => {
		mocks.dashboard.mockResolvedValue({ totals: { total: 3 } });
		expect(await load({ locals: { user: { accountId: 'owner' } } } as never)).toMatchObject({
			dashboard: { totals: { total: 3 } },
			loadError: null
		});
		expect(mocks.dashboard).toHaveBeenCalledWith('owner');
	});
	it('rejects requests without an authenticated account', async () => {
		await expect(load({ locals: { user: null } } as never)).rejects.toMatchObject({ status: 401 });
		expect(mocks.dashboard).not.toHaveBeenCalled();
	});
	it('exposes retryable failure without fabricated zero totals or database details', async () => {
		mocks.dashboard.mockRejectedValue(new Error('private SQL detail'));
		expect(await load({ locals: { user: { accountId: 'owner' } } } as never)).toEqual({
			dashboard: null,
			loadError: 'Your account data could not be loaded. Try again.'
		});
	});
});
