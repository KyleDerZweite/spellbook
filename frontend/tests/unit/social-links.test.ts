import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Footer from '../../src/lib/components/layout/Footer.svelte';
import { parseSocialLinks } from '../../src/lib/server/social.ts';
import { GITHUB_REPOSITORY_URL } from '../../src/lib/social.ts';

describe('social link configuration', () => {
	it('always includes the GitHub repository backlink and omits unset optional socials', () => {
		expect(parseSocialLinks({})).toEqual([{ id: 'github', href: GITHUB_REPOSITORY_URL }]);
		expect(parseSocialLinks({ SOCIAL_DISCORD_URL: '   ' })).toEqual([
			{ id: 'github', href: GITHUB_REPOSITORY_URL }
		]);
	});

	it('includes Discord when configured with a valid HTTPS URL', () => {
		expect(parseSocialLinks({ SOCIAL_DISCORD_URL: ' https://discord.gg/spellbook ' })).toEqual([
			{ id: 'github', href: GITHUB_REPOSITORY_URL },
			{ id: 'discord', href: 'https://discord.gg/spellbook' }
		]);
	});

	it('rejects non-HTTPS or malformed social URLs without leaking the value', () => {
		for (const invalid of [
			'http://discord.gg/spellbook',
			'javascript:alert(1)',
			'not-a-url',
			'ftp://discord.gg/spellbook'
		]) {
			expect(() => parseSocialLinks({ SOCIAL_DISCORD_URL: invalid })).toThrow(
				'SOCIAL_DISCORD_URL must be a valid HTTPS URL'
			);
		}
	});
});

describe('Footer social links rendering', () => {
	it('renders the GitHub backlink without Discord when only GitHub is configured', () => {
		const { body } = render(Footer, {
			props: { socialLinks: parseSocialLinks({}) }
		});
		expect(body).toContain(`href="${GITHUB_REPOSITORY_URL}"`);
		expect(body).toContain('aria-label="Spellbook on GitHub"');
		expect(body).toContain('rel="noopener noreferrer"');
		expect(body).not.toContain('Discord');
		expect(body).not.toContain('phase.rs');
	});

	it('renders configured Discord alongside GitHub', () => {
		const { body } = render(Footer, {
			props: {
				socialLinks: parseSocialLinks({ SOCIAL_DISCORD_URL: 'https://discord.gg/spellbook' })
			}
		});
		expect(body).toContain(`href="${GITHUB_REPOSITORY_URL}"`);
		expect(body).toContain('href="https://discord.gg/spellbook"');
		expect(body).toContain('aria-label="Spellbook on Discord"');
		expect(body).toContain('rel="noopener noreferrer"');
	});
});
