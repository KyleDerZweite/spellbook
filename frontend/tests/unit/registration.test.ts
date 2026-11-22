import { describe, expect, it, vi } from 'vitest';
import { parseRegistrationEnabled, registrationOpen } from '../../src/lib/server/auth/registration';

vi.mock('@sveltejs/kit', () => ({
	redirect: (status: number, location: string) => {
		throw { status, location };
	}
}));

describe('registration switch', () => {
	it('defaults open and rejects anything but true or false', () => {
		expect(parseRegistrationEnabled(undefined)).toBe(true);
		expect(parseRegistrationEnabled('true')).toBe(true);
		expect(parseRegistrationEnabled('false')).toBe(false);
		for (const value of ['', 'False', '0', 'yes'])
			expect(() => parseRegistrationEnabled(value)).toThrow(
				'REGISTRATION_ENABLED must be true or false'
			);
	});

	it('shares one check for Demo mode and the operator switch', () => {
		expect(registrationOpen(true, false)).toBe(true);
		expect(registrationOpen(false, false)).toBe(false);
		expect(registrationOpen(true, true)).toBe(false);
	});

	it('redirects the registration page to sign-in when closed', async () => {
		vi.stubEnv('REGISTRATION_ENABLED', 'false');
		vi.resetModules(); // the flag is parsed at module load
		try {
			const { load } = await import('../../src/routes/auth/register/+page.server');
			const url = new URL('https://spellbook.test/auth/register?returnTo=/mtg/decks');
			expect(() => load({ locals: {}, url } as never)).toThrow(
				expect.objectContaining({
					status: 303,
					location: `/auth/login?returnTo=${encodeURIComponent('/mtg/decks')}`
				})
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
