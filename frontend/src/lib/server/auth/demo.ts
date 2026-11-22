/** Explicit opt-in for disposable demo deployments. */
export const demoMode = process.env.DEMO_MODE === 'true';

export function parseDemoLoginEnabled(value: string | undefined): boolean {
	if (value === undefined || value === 'false') return false;
	if (value === 'true') return true;
	throw new Error('DEMO_LOGIN_ENABLED must be true or false');
}

/** Shared demo/demo login on a normal deployment. Parsed at module load (imported by hooks.server). */
export const demoLoginEnabled = parseDemoLoginEnabled(process.env.DEMO_LOGIN_ENABLED);

/** Whether `/demo` and `/auth/login/demo` offer the shared demo account. */
export function sharedDemoLogin(enabled = demoLoginEnabled, demo = demoMode): boolean {
	return enabled || demo;
}

export function acceptsDemoLogin(
	mode: 'login' | 'register',
	username: string | null,
	password: unknown,
	enabled = demoMode
): password is string {
	return enabled && mode === 'login' && username === 'demo' && password === 'demo';
}
