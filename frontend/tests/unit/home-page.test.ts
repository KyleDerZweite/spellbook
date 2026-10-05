import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ summary: vi.fn(), decks: vi.fn() }));
vi.mock('../../src/lib/server/data/inventory.ts', () => ({ getHomeSummary: mocks.summary }));
vi.mock('../../src/lib/server/data/decks.ts', () => ({ getRecentDecks: mocks.decks }));
import { load } from '../../src/routes/+page.server';

beforeEach(() => vi.clearAllMocks());
function event(accountId: string | null) {
	return {
		locals: { user: accountId ? { accountId } : null },
		parent: async () => ({ activeGame: 'mtg' })
	} as unknown as Parameters<typeof load>[0];
}
describe('home workspace data', () => {
	it('keeps public showcase independent of account repositories', async () => {
		const result = await load(event(null));
		expect(result).toMatchObject({ recentAdditions: [], recentDecks: [] });
		expect(mocks.summary).not.toHaveBeenCalled();
		expect(mocks.decks).not.toHaveBeenCalled();
	});
	it('loads each signed-in account using its own account identifier', async () => {
		mocks.summary.mockResolvedValue({ stats: { total: 1 }, recentAdditions: [] });
		mocks.decks.mockResolvedValue([{ id: 'deck-1', name: 'My deck', format: 'Commander' }]);
		const result = await load(event('owner'));
		expect(mocks.summary).toHaveBeenCalledWith('owner', 'mtg');
		expect(mocks.decks).toHaveBeenCalledWith('owner', 'mtg');
		expect(result).toMatchObject({ recentDecks: [{ id: 'deck-1' }] });
	});
});
