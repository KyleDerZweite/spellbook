import { describe, expect, it } from 'vitest';
import { negotiateLocale } from '../../src/lib/i18n/locale.ts';
import { translate, validateDictionaries, pluralKey } from '../../src/lib/i18n/messages.ts';
import { formatReferenceEUR, formatValueEUR } from '../../src/lib/valuation/money.ts';
import { POST } from '../../src/routes/language/+server.ts';
describe('website language', () => {
	it('resolves cookie, weighted regional browser language and fallback independently', () => {
		expect(negotiateLocale('de', 'en')).toBe('de');
		expect(negotiateLocale('invalid', 'fr, en-GB;q=0.2, de-DE;q=0.8')).toBe('de');
		expect(negotiateLocale(undefined, 'de;q=0, en;q=0.7')).toBe('en');
		expect(negotiateLocale(undefined, 'de;q=bad, fr')).toBe('en');
		expect(negotiateLocale(undefined, null)).toBe('en');
	});
	it('validates both bundled dictionaries and interpolates plural messages', () => {
		expect(validateDictionaries).not.toThrow();
		expect(translate('de', `cards.${pluralKey('de', 2)}`, { count: 2 })).toBe('2 Karten');
		expect(translate('en', `cards.${pluralKey('en', 1)}`, { count: 1 })).toBe('1 card');
	});
	it('retains exact large amounts and half-up rounding in both locales', () => {
		expect(formatReferenceEUR('0.005', 3, 'de')).toBe('0,02\u00a0€');
		expect(formatValueEUR('9007199254740993.01', 'de')).toBe('9.007.199.254.740.993,01\u00a0€');
		expect(formatValueEUR('9007199254740993.01', 'en')).toBe('€9,007,199,254,740,993.01');
	});
	function event(locale: string, returnTo: string, origin = 'https://spellbook.test') {
		const writes: unknown[] = [];
		return {
			writes,
			event: {
				request: new Request('https://spellbook.test/language', {
					method: 'POST',
					headers: { origin },
					body: new URLSearchParams({ locale, returnTo })
				}),
				url: new URL('https://spellbook.test/language'),
				cookies: { set: (...args: unknown[]) => writes.push(args) }
			}
		};
	}
	it('persists a supported language for guests and preserves the local query', async () => {
		const fixture = event('de', '/mtg/search?q=Island&language=en');
		await expect(POST(fixture.event as never)).rejects.toMatchObject({
			status: 303,
			location: '/mtg/search?q=Island&language=en'
		});
		expect(fixture.writes).toEqual([
			[
				'website-language',
				'de',
				expect.objectContaining({ path: '/', httpOnly: true, secure: true, sameSite: 'lax' })
			]
		]);
	});
	it('rejects cross-origin writes and unsupported locales without changing cookies', async () => {
		for (const fixture of [event('de', '/', 'https://evil.test'), event('fr', '/')]) {
			await expect(POST(fixture.event as never)).rejects.toMatchObject({
				status: fixture.event.request.headers.get('origin') === 'https://evil.test' ? 403 : 400
			});
			expect(fixture.writes).toEqual([]);
		}
	});
	it('rejects external redirects', async () => {
		await expect(POST(event('en', '//evil.test').event as never)).rejects.toMatchObject({
			status: 303,
			location: '/mtg/inventory'
		});
	});
});

import { render } from 'svelte/server';
import WebsiteLanguage from '../fixtures/WebsiteLanguage.svelte';
it('renders German SSR controls in request context without translating card-language query values', async () => {
	const [german, english] = await Promise.all([
		render(WebsiteLanguage, { props: { locale: 'de' } }),
		render(WebsiteLanguage, { props: { locale: 'en' } })
	]);
	expect(german.body).toContain('Anzahl 2 Karten');
	expect(german.body).toContain('Nächste 200 Ergebnisse');
	expect(german.body).toContain('language=en');
	expect(english.body).toContain('Quantity 2 cards');
	expect(english.body).toContain('Next 200 results');
});

it('supports an enhanced cookie-only update without navigating or submitting page writes', async () => {
	const fixture = {
		writes: [] as unknown[],
		event: {
			request: new Request('https://spellbook.test/language', {
				method: 'POST',
				headers: { Origin: 'https://spellbook.test', Accept: 'application/json' },
				body: new URLSearchParams({ locale: 'de', returnTo: '/mtg/decks?deck=existing' })
			}),
			url: new URL('https://spellbook.test/language'),
			cookies: { set: (...args: unknown[]) => fixture.writes.push(args) }
		}
	};
	const response = await POST(fixture.event as never);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ locale: 'de' });
	expect(fixture.writes).toHaveLength(1);
});

import { createLanguage } from '../../src/lib/i18n/context.ts';
it('updates the selected translation through the existing language context', () => {
	let locale: 'en' | 'de' = 'en';
	const language = createLanguage(
		() => locale,
		(value) => {
			locale = value;
		}
	);
	language.select('de');
	expect(language.t('ui.Sign.in')).toBe('Anmelden');
});
