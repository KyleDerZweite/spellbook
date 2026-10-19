import { requireFormOrigin } from './auth.ts';
import { clearSessionCookie, readCookie, SESSION_COOKIE } from './cookies.ts';
import { error, errorResponse, json } from './errors.ts';
import type { HttpDependencies, HttpRequestMetadata, HttpRoute } from './types.ts';

/** These handlers set privacy before authentication and parsing in the existing API. */
function cachePolicy(path: string): string | undefined {
	if (
		path === '/api/mobile/v1/mtg/inventory/value' ||
		path === '/api/mobile/v1/mtg/inventory/value-history'
	)
		return 'private, no-store';
	if (path.startsWith('/api/auth/') || path.startsWith('/api/account/')) return 'no-store';
	if (
		['/api/web/v1/auth/login', '/api/web/v1/auth/register', '/api/web/v1/password'].includes(path)
	)
		return 'no-store';
	return undefined;
}

export function createRouter(routes: HttpRoute[], dependencies: HttpDependencies) {
	const compiled = routes
		.map((route) => ({ route, segments: route.path.split('/') }))
		.sort((a, b) => {
			for (let i = 0; i < Math.min(a.segments.length, b.segments.length); i++) {
				const specificity =
					Number(a.segments[i].startsWith(':')) - Number(b.segments[i].startsWith(':'));
				if (specificity) return specificity;
			}
			return b.segments.length - a.segments.length;
		});
	const keys = new Set<string>();
	for (const { route } of compiled) {
		const key = `${route.method} ${route.path}`;
		if (keys.has(key)) throw new Error(`Duplicate HTTP route: ${key}`);
		keys.add(key);
	}
	return async (request: Request, metadata: HttpRequestMetadata): Promise<Response> => {
		const url = new URL(request.url);
		const pathname = url.pathname.replace(/\/$/, '') || '/';
		const responseHeaders = new Headers();
		const policy = cachePolicy(pathname);
		let response: Response;
		try {
			const segments = pathname.split('/');
			const candidates = compiled.filter(
				({ segments: expected }) =>
					expected.length === segments.length &&
					expected.every((segment, i) => segment.startsWith(':') || segment === segments[i])
			);
			const matches = candidates.filter(({ route }) => route.path === candidates[0]?.route.path);
			const method = request.method === 'HEAD' ? 'GET' : request.method;
			const match = matches.find(({ route }) => route.method === method);
			if (!matches.length) error(404, 'Not Found');
			const allowed = [
				...new Set(
					matches.flatMap(({ route }) =>
						route.method === 'GET' ? ['GET', 'HEAD'] : [route.method]
					)
				)
			];
			allowed.push('OPTIONS');
			if (request.method === 'OPTIONS')
				response = new Response(null, { status: 204, headers: { Allow: allowed.join(', ') } });
			else if (!match)
				response = json(
					{ message: 'Method Not Allowed' },
					{ status: 405, headers: { Allow: allowed.join(', ') } }
				);
			else {
				const params: Record<string, string> = Object.create(null);
				for (let i = 0; i < segments.length; i++) {
					if (!match.segments[i].startsWith(':')) continue;
					try {
						params[match.segments[i].slice(1)] = decodeURIComponent(segments[i]);
					} catch {
						error(400, 'Invalid path encoding');
					}
				}
				const context = { request, url, params, clientAddress: metadata.clientAddress };
				requireFormOrigin(context, dependencies, match.route.path);
				// Preserve stale browser-cookie cleanup independently of bearer selection.
				const cookie = readCookie(request, SESSION_COOKIE);
				if (cookie && !(await dependencies.application.auth.validateSession(cookie)))
					clearSessionCookie(responseHeaders, dependencies.publicOrigin);
				response = await match.route.handle(context);
			}
		} catch (cause) {
			response = errorResponse(cause);
		}
		if (policy) response.headers.set('Cache-Control', policy);
		if (url.pathname.startsWith('/api/')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
		const cleanupCookies = responseHeaders.getSetCookie();
		if (cleanupCookies.length) {
			// A handler's replacement must follow cleanup for the same cookie name and path.
			const handlerCookies = response.headers.getSetCookie();
			response.headers.delete('Set-Cookie');
			for (const cookie of [...cleanupCookies, ...handlerCookies])
				response.headers.append('Set-Cookie', cookie);
		}
		if (request.method === 'HEAD') {
			await response.body?.cancel();
			return new Response(null, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		}
		return response;
	};
}
