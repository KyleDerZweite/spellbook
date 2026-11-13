import { describe, expect, it } from 'vitest';
import { load } from '../../src/routes/+page.server';
describe('public home data', () => {
	it.each([null, 'owner'])('does not load private account data for %s', async (accountId) => {
		const data = await load({ locals: { user: accountId ? { accountId } : null } } as never);
		expect(data).toEqual({ landingSeed: expect.any(Number) });
		expect(Number.isInteger(data?.landingSeed)).toBe(true);
		expect(data?.landingSeed).toBeGreaterThanOrEqual(0);
		expect(data?.landingSeed).toBeLessThan(0x100000000);
	});
});
