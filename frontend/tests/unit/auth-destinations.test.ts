import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), revoke: vi.fn(), cookie: vi.fn() }));
vi.mock('../../src/lib/server/auth/local.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	authenticate: mocks.authenticate
}));
vi.mock('../../src/lib/server/auth/session.ts', async (importOriginal) => ({
	...(await importOriginal<object>()),
	revokeSession: mocks.revoke,
	writeSessionCookie: mocks.cookie
}));
import { load as login } from '../../src/routes/auth/login/+page.server';
import { load as register } from '../../src/routes/auth/register/+page.server';
import { submitAuthForm } from '../../src/lib/server/auth/forms';
describe('browser authentication destinations', () => {
	it.each([login, register])(
		'uses inventory by default and preserves explicit destinations in auth page loads',
		async (load) => {
			for (const [query, destination] of [
				['', '/mtg/inventory'],
				['?returnTo=%2F', '/'],
				[
					'?returnTo=%2Fmtg%2Fsearch%3Fq%3DSol%2520Ring%26sort%3Dname',
					'/mtg/search?q=Sol%20Ring&sort=name'
				],
				['?returnTo=https://foreign.test', '/mtg/inventory']
			]) {
				const url = new URL(`https://spellbook.test/auth/login${query}`);
				expect(await load({ locals: { user: null }, url } as never)).toMatchObject({
					returnTo: destination
				});
				expect(() => load({ locals: { user: { accountId: 'owner' } }, url } as never)).toThrow(
					expect.objectContaining({ status: 303, location: destination })
				);
			}
		}
	);
	it.each(['login', 'register'] as const)(
		'preserves the destination after successful %s submission',
		async (mode) => {
			mocks.authenticate.mockResolvedValue({ session: { token: 'session-token' } });
			for (const [query, destination] of [
				['', '/mtg/inventory'],
				['?returnTo=%2F', '/'],
				[
					'?returnTo=%2Fmtg%2Fdecks%3Fdeck%3D123%26q%3DSol%2520Ring',
					'/mtg/decks?deck=123&q=Sol%20Ring'
				]
			]) {
				const url = new URL(`https://spellbook.test/auth/${mode}${query}`);
				await expect(
					submitAuthForm(
						{
							url,
							request: new Request(url, {
								method: 'POST',
								headers: { origin: url.origin },
								body: new URLSearchParams({ username: 'mage', password: 'long-password' })
							}),
							cookies: { get: () => undefined },
							getClientAddress: () => crypto.randomUUID()
						} as never,
						mode
					)
				).rejects.toMatchObject({ status: 303, location: destination });
			}
		}
	);
});
