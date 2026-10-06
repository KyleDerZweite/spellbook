import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), pending: vi.fn() }));
vi.mock('../../src/lib/server/data/decks', () => ({ getDeckSnapshot: mocks.snapshot }));
vi.mock('../../src/lib/server/data/scan', () => ({ countPendingScanReviews: mocks.pending }));
import { getDashboard } from '../../src/lib/server/data/dashboard';
beforeEach(() => {
	vi.clearAllMocks();
	mocks.snapshot.mockResolvedValue({ decks: [], inventoryCards: [], deckCards: [] });
	mocks.pending.mockResolvedValue(120);
});
describe('dashboard account data', () => {
	it('uses full repository data and account-scoped pending count rather than the recent-session list', async () => {
		const result = await getDashboard('owner', 'mtg');
		expect(mocks.snapshot).toHaveBeenCalledWith('owner', 'mtg');
		expect(mocks.pending).toHaveBeenCalledWith('owner', 'mtg');
		expect(result.pendingScanReviews).toBe(120);
	});
	it('reports unavailable scan counts separately from successful account totals', async () => {
		mocks.pending.mockRejectedValue(new Error('scan query failed'));
		expect(await getDashboard('owner')).toMatchObject({
			totals: { total: 0 },
			pendingScanReviews: null
		});
	});
	it('preserves snapshot failures instead of returning invented empty account data', async () => {
		mocks.snapshot.mockRejectedValue(new Error('inventory query failed'));
		await expect(getDashboard('owner')).rejects.toThrow('inventory query failed');
	});
});
