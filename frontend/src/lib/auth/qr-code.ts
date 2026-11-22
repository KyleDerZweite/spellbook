/** Accept only this instance's QR approval links, or its opaque public request code. */
export function parseQrAuthorizationInput(value: string, origin: string): string | null {
	const input = value.trim();
	if (/^[A-Za-z0-9_-]{43}$/.test(input)) return input;
	try {
		const url = new URL(input, origin);
		if (
			url.origin !== origin ||
			url.username ||
			url.password ||
			url.pathname !== '/auth/approve' ||
			url.hash ||
			url.searchParams.size !== 1
		)
			return null;
		const code = url.searchParams.get('code');
		return code && /^[A-Za-z0-9_-]{43}$/.test(code) ? code : null;
	} catch {
		return null;
	}
}

/** The comparison code shown on both screens: the first 8 characters as `XXXX-XXXX`, case preserved. */
export function formatQrDisplayCode(code: string): string {
	return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
}
