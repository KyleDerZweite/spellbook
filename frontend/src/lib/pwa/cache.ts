const PUBLIC_FILES = new Set([
	'offline.html',
	'logo.webp',
	'favicon.ico',
	'favicon.png',
	'apple-touch-icon.png',
	'icon-192.png',
	'icon-512.png',
	'icon-maskable-512.png'
]);

/** Only build-listed immutable code/styles and these public files may enter Cache Storage. */
export function publicCachePaths(
	immutable: ReadonlyArray<{ path: string }>,
	assets: ReadonlyArray<{ path: string }>
): string[] {
	return [
		...immutable
			.map(({ path }) => path)
			.filter((path) => /^_app\/immutable\/.+\.(js|css)$/.test(path)),
		...assets.map(({ path }) => path).filter((path) => PUBLIC_FILES.has(path))
	];
}

export function isPublicAssetResponse(path: string, response: Response): boolean {
	if (!response.ok || response.redirected || response.type === 'opaque') return false;
	if (/\b(private|no-store)\b/i.test(response.headers.get('cache-control') ?? '')) return false;
	const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	if (path.endsWith('.js')) return type === 'text/javascript' || type === 'application/javascript';
	if (path.endsWith('.css')) return type === 'text/css';
	if (path === 'offline.html') return type === 'text/html';
	if (path.endsWith('.png')) return type === 'image/png';
	if (path.endsWith('.webp')) return type === 'image/webp';
	return path === 'favicon.ico' && (type === 'image/x-icon' || type === 'image/vnd.microsoft.icon');
}

/** HTTP errors retain their real response. Only a rejected navigation gets the public fallback. */
export async function navigationResponse(
	network: () => Promise<Response>,
	fallback: () => Promise<Response | undefined>
): Promise<Response> {
	try {
		return await network();
	} catch {
		return (
			(await fallback()) ??
			new Response('Spellbook needs an internet connection. Reconnect and reload this page.', {
				status: 503,
				headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
			})
		);
	}
}
