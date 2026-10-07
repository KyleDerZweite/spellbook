import { expect, it } from 'vitest';
import { confirmAuthenticatedNavigation } from '#lib/saved-state/authentication.ts';

it('requires a current authenticated same-account response rather than cached SSR identity', async () => {
	const signal = new AbortController().signal;
	const request =
		(status: number, accountId = 'a'): typeof fetch =>
		async () =>
			new Response(JSON.stringify({ user: { accountId } }), { status });
	expect(await confirmAuthenticatedNavigation('a', signal, () => true, request(401))).toBe(false);
	expect(await confirmAuthenticatedNavigation('a', signal, () => true, request(503))).toBe(false);
	expect(await confirmAuthenticatedNavigation('a', signal, () => true, request(200, 'b'))).toBe(
		false
	);
	expect(await confirmAuthenticatedNavigation('a', signal, () => true, request(200))).toBe(true);
	let current = true;
	const stale: typeof fetch = async (_path, options) => {
		expect(options?.cache).toBe('no-store');
		const response = new Response(JSON.stringify({ user: { accountId: 'a' } }));
		const decode = response.json.bind(response);
		response.json = async () => {
			current = false;
			return decode();
		};
		return response;
	};
	expect(await confirmAuthenticatedNavigation('a', signal, () => current, stale)).toBe(false);
});
