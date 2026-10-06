import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../src/lib/server/composition.ts', () => ({
	application: { dashboard: { get: mocks.get } }
}));
import { getDashboard } from '../../src/lib/server/data/dashboard.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
const user: AuthUser = {
	accountId: 'owner',
	username: 'mage',
	email: '',
	avatarId: 'wizard',
	artworkId: 'grove'
};
beforeEach(() => vi.clearAllMocks());
describe('dashboard web adaptation', () => {
	it('preserves the authenticated actor and backend summary', async () => {
		const summary = { totals: { total: 3 }, pendingScanReviews: null };
		mocks.get.mockResolvedValue(summary);
		expect(await getDashboard(user)).toBe(summary);
		expect(mocks.get).toHaveBeenCalledWith(user);
	});
	it('preserves use-case failure for the page retry state', async () => {
		mocks.get.mockRejectedValue(new Error('read failed'));
		await expect(getDashboard(user)).rejects.toThrow('read failed');
	});
});
