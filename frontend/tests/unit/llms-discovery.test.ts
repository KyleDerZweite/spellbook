import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deployment = vi.hoisted(() => ({ demoMode: false }));
vi.mock('#lib/server/auth/demo.ts', () => ({
	get demoMode() {
		return deployment.demoMode;
	}
}));

import { GET as guideGet } from '../../src/routes/llms.txt/+server';
import { GET as legacyGet } from '../../src/routes/agents.md/+server';

describe('public agent discovery', () => {
	beforeEach(() => {
		deployment.demoMode = false;
	});

	it.each(['https://spellbook.test', 'https://private.spellbook.test'])(
		'provides a product overview and same-origin account and API links for %s',
		async (origin) => {
			const response = await guideGet({ url: new URL(`${origin}/llms.txt`) } as never);
			const guide = await response.text();
			const links = [...guide.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);

			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
			expect(response.headers.get('cache-control')).toBe('no-store');
			expect(guide).toMatch(/^# Spellbook\n\n> .*Magic: The Gathering/);
			expect(guide).toContain('Catalog browsing is public.');
			expect(links).toEqual(
				expect.arrayContaining(
					[
						'/api/auth/register',
						'/api/auth/login',
						'/api/auth/logout',
						'/auth/register',
						'/auth/login',
						'/mtg/search',
						'/mtg/inventory',
						'/mtg/decks',
						'/mtg/scan',
						'/openapi.json'
					].map((path) => `${origin}${path}`)
				)
			);
			expect(links.every((link) => new URL(link).origin === origin)).toBe(true);
			expect(guide).toContain('Store the origin, selected username, and generated password');
			expect(guide).toContain('Never print passwords or tokens in chat, tool output, or logs.');
			expect(guide).toContain(
				'Do not forward credentials or authorization headers to another origin'
			);
			expect(guide).toContain(`Try POST ${origin}/api/auth/login`);
			expect(guide).toContain('Do not create a second account under a different name.');
			expect(guide).toContain('full-account bearer session with a fixed 30-day lifetime');
		}
	);

	it('publishes the disabled registration contract in demo mode', async () => {
		deployment.demoMode = true;
		const response = await guideGet({ url: new URL('https://demo.test/llms.txt') } as never);
		const guide = await response.text();

		expect(guide).toMatch(/^# Spellbook\n\n> /);
		expect(guide).toContain('New account registration is disabled.');
		expect(guide).toContain('Do not call the registration API');
		expect(guide).toContain('shared editable account');
		expect(guide).toContain('[Demo login](https://demo.test/auth/login)');
		expect(guide).toContain('[OpenAPI](https://demo.test/openapi.json)');
		expect(guide).not.toContain('/api/auth/register');
		expect(guide).not.toContain('/auth/register');
	});

	it('redirects the old guide permanently to the same-origin discovery path', async () => {
		const response = await legacyGet({
			url: new URL('https://spellbook.test/agents.md?returnTo=https://foreign.test')
		} as never);

		expect(response.status).toBe(308);
		expect(response.headers.get('location')).toBe('/llms.txt');
		expect(await response.text()).toBe('');
	});

	it('discovers the guide from the shared HTML head', () => {
		const layout = readFileSync(
			new URL('../../src/routes/+layout.svelte', import.meta.url),
			'utf8'
		);

		expect(layout).toContain('rel="describedby" type="text/plain" href="/llms.txt"');
		expect(layout).not.toContain('href="/agents.md"');
	});
});
