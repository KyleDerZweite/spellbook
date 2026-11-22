import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDemoLoginEnabled, sharedDemoLogin } from '../../src/lib/server/auth/demo';
import LoginPage from '../../src/routes/auth/login/+page.svelte';
import DemoLoginPage from '../../src/routes/auth/login/demo/+page.svelte';

vi.mock('@sveltejs/kit', () => ({
	error: (status: number) => {
		throw { status };
	},
	redirect: (status: number, location: string) => {
		throw { status, location };
	}
}));

const submitAuthForm = vi.hoisted(() => vi.fn(async () => ({ submitted: true })));
vi.mock('#lib/server/auth/forms.ts', () => ({ submitAuthForm }));

/** The flags are parsed at module load, so each case imports fresh route modules. */
async function routes(env: { DEMO_LOGIN_ENABLED?: string; DEMO_MODE?: string }) {
	vi.resetModules();
	vi.stubEnv('DEMO_LOGIN_ENABLED', env.DEMO_LOGIN_ENABLED ?? 'false');
	vi.stubEnv('DEMO_MODE', env.DEMO_MODE ?? 'false');
	return {
		demo: await import('../../src/routes/demo/+page.server'),
		login: await import('../../src/routes/auth/login/demo/+page.server')
	};
}

const url = new URL('https://spellbook.test/auth/login/demo?returnTo=/mtg/decks');

describe('shared demo login', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		submitAuthForm.mockClear();
	});

	it('defaults off and rejects anything but true or false', () => {
		expect(parseDemoLoginEnabled(undefined)).toBe(false);
		expect(parseDemoLoginEnabled('false')).toBe(false);
		expect(parseDemoLoginEnabled('true')).toBe(true);
		for (const value of ['', 'False', '1', 'yes'])
			expect(() => parseDemoLoginEnabled(value)).toThrow(
				'DEMO_LOGIN_ENABLED must be true or false'
			);
	});

	it('is offered by the operator switch or Demo mode', () => {
		expect(sharedDemoLogin(false, false)).toBe(false);
		expect(sharedDemoLogin(true, false)).toBe(true);
		expect(sharedDemoLogin(false, true)).toBe(true);
	});

	it('returns 404 for both routes and the action while disabled', async () => {
		const { demo, login } = await routes({ DEMO_LOGIN_ENABLED: 'false' });
		expect(() => demo.load({} as never)).toThrow(expect.objectContaining({ status: 404 }));
		expect(() => login.load({ locals: {}, url } as never)).toThrow(
			expect.objectContaining({ status: 404 })
		);
		expect(() => login.actions.default({ url } as never)).toThrow(
			expect.objectContaining({ status: 404 })
		);
		expect(submitAuthForm).not.toHaveBeenCalled();
	});

	it.each([{ DEMO_LOGIN_ENABLED: 'true' }, { DEMO_MODE: 'true' }])(
		'redirects /demo to the pre-filled form when enabled by %o',
		async (env) => {
			const { demo, login } = await routes(env);
			expect(() => demo.load({} as never)).toThrow({ status: 303, location: '/auth/login/demo' });
			expect(login.load({ locals: {}, url } as never)).toEqual({ returnTo: '/mtg/decks' });
		}
	);

	it('sends signed-in visitors to returnTo and signs in only through the POST action', async () => {
		const { login } = await routes({ DEMO_LOGIN_ENABLED: 'true' });
		expect(() => login.load({ locals: { user: { username: 'kyle' } }, url } as never)).toThrow({
			status: 303,
			location: '/mtg/decks'
		});
		expect(submitAuthForm).not.toHaveBeenCalled();
		const event = { url };
		await expect(login.actions.default(event as never)).resolves.toEqual({ submitted: true });
		expect(submitAuthForm).toHaveBeenCalledWith(event, 'login');
	});

	it('renders the pre-filled shared account form with the short password rule', () => {
		const { body } = render(DemoLoginPage, {
			props: { data: { returnTo: '/' }, form: null } as never
		});
		expect(body).toContain('This is the shared Demo account.');
		expect(body).toContain('Sign out anytime to use your own account.');
		expect(body).toMatch(/name="username"[^>]*value="demo"/);
		expect(body).toMatch(/value="demo"[^>]*type="password"|type="password"[^>]*value="demo"/);
		expect(body).toContain('minlength="4"');
		expect(body).toContain('method="POST"');
	});

	it('links the sign-in page to the shared account only when the switch is on', () => {
		const page = (demoLoginEnabled: boolean) =>
			render(LoginPage, {
				props: {
					data: { returnTo: '/mtg/decks', demoMode: false, demoLoginEnabled },
					form: null
				} as never
			}).body;
		// The standard form keeps the 12-character rule; the link leads to the demo form.
		const enabled = page(true);
		expect(enabled).toContain(
			`href="/auth/login/demo?returnTo=${encodeURIComponent('/mtg/decks')}"`
		);
		expect(enabled).toContain('minlength="12"');
		const disabled = page(false);
		expect(disabled).not.toContain('/auth/login/demo');
		expect(disabled).toContain('minlength="12"');
	});

	it('keeps /settings/password usable outside Demo mode so an ordinary demo account is not locked', async () => {
		vi.resetModules();
		vi.stubEnv('DEMO_LOGIN_ENABLED', 'true');
		vi.stubEnv('DEMO_MODE', 'false');
		const normal = await import('../../src/routes/settings/password/+page.server');
		await expect(normal.load({ locals: { user: { username: 'demo' } } } as never)).resolves.toEqual(
			{ demoMode: false }
		);
		vi.resetModules();
		vi.stubEnv('DEMO_MODE', 'true');
		const demo = await import('../../src/routes/settings/password/+page.server');
		await expect(demo.load({ locals: { user: { username: 'demo' } } } as never)).resolves.toEqual({
			demoMode: true
		});
	});
});
