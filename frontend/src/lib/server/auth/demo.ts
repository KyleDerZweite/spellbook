/** Explicit opt-in for disposable demo deployments. */
export const demoMode = process.env.DEMO_MODE === 'true';

export function acceptsDemoLogin(
	mode: 'login' | 'register',
	username: string | null,
	password: unknown,
	enabled = demoMode
): password is string {
	return enabled && mode === 'login' && username === 'demo' && password === 'demo';
}
