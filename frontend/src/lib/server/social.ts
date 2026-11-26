import { GITHUB_REPOSITORY_URL, type SocialLink, type SocialLinkId } from '#lib/social.ts';

interface OptionalSocialEnv {
	readonly id: Exclude<SocialLinkId, 'github'>;
	readonly envKey: string;
}

const OPTIONAL_SOCIALS: readonly OptionalSocialEnv[] = [
	{ id: 'discord', envKey: 'SOCIAL_DISCORD_URL' }
];

export function parseOptionalSocialUrl(envKey: string, value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`${envKey} must be a valid HTTPS URL`);
	}
	if (parsed.protocol !== 'https:') {
		throw new Error(`${envKey} must be a valid HTTPS URL`);
	}
	return parsed.toString();
}

export function parseSocialLinks(
	env: Readonly<Record<string, string | undefined>> = process.env
): readonly SocialLink[] {
	const links: SocialLink[] = [{ id: 'github', href: GITHUB_REPOSITORY_URL }];
	for (const { id, envKey } of OPTIONAL_SOCIALS) {
		const href = parseOptionalSocialUrl(envKey, env[envKey]);
		if (href) links.push({ id, href });
	}
	return links;
}

/** Parsed once at module load so an invalid configured URL fails server startup. */
export const configuredSocialLinks = parseSocialLinks();
