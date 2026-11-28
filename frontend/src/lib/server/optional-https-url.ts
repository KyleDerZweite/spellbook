export function parseOptionalHttpsUrl(envKey: string, value: string | undefined): string | null {
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
