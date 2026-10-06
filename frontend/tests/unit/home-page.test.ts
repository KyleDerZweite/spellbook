import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ summary: vi.fn(), decks: vi.fn() }));
vi.mock('../../src/lib/server/data/inventory.ts', () => ({ getHomeSummary: mocks.summary }));
vi.mock('../../src/lib/server/data/decks.ts', () => ({ getRecentDecks: mocks.decks }));
import { load } from '../../src/routes/+page.server';
describe('public home data', () => {
	it.each([null, 'owner'])('does not load private account data for %s', async (accountId) => {
		expect(await load({ locals: { user: accountId ? { accountId } : null } } as never)).toEqual({});
		expect(mocks.summary).not.toHaveBeenCalled();
		expect(mocks.decks).not.toHaveBeenCalled();
	});
});
