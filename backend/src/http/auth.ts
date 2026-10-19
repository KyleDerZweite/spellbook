import { error } from './errors.ts';
import { readCookie, SESSION_COOKIE } from './cookies.ts';
import type { HttpDependencies, RouteContext } from './types.ts';

export function getBearerToken(request: Request): string | undefined {
	return /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
}

export function selectedToken(request: Request): string | undefined {
	return request.headers.has('authorization')
		? getBearerToken(request)
		: readCookie(request, SESSION_COOKIE);
}

export function requireSameOrigin(
	context: Pick<RouteContext, 'request'>,
	dependencies: Pick<HttpDependencies, 'publicOrigin'>,
	allowMissing = false
): void {
	const origin = context.request.headers.get('origin');
	if (origin !== dependencies.publicOrigin && !(origin === null && allowMissing))
		error(403, 'Invalid request origin');
}

export async function requireMobileAuth(context: RouteContext, dependencies: HttpDependencies) {
	const { request } = context;
	const user = await dependencies.application.auth.validateSession(selectedToken(request));
	if (request.headers.has('authorization')) {
		if (!user) error(401, 'Invalid bearer token');
		return { user };
	}
	if (!user) error(401, 'Authentication required');
	if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
		requireSameOrigin(context, dependencies);
	return { user };
}

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);
const BODYLESS_BEARER_ROUTES = new Set([
	'DELETE /api/mobile/v1/mtg/decks/:deckId',
	'DELETE /api/mobile/v1/mtg/deck-cards/:entryId',
	'DELETE /api/mobile/v1/mtg/inventory/:entryId',
	'POST /api/mobile/v1/mtg/scan/sessions',
	'POST /api/auth/logout'
]);

export function requireFormOrigin(
	context: RouteContext,
	dependencies: HttpDependencies,
	routePath: string
): void {
	const { request } = context;
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (contentType && !FORM_CONTENT_TYPES.has(contentType)) return;
	const origin = request.headers.get('origin');
	if (origin === dependencies.publicOrigin) return;
	if (origin === null && getBearerToken(request)) {
		if (
			request.method === 'POST' &&
			contentType === 'multipart/form-data' &&
			routePath === '/api/mobile/v1/mtg/scan/sessions/:sessionId/frames'
		)
			return;
		if (
			!contentType &&
			request.body === null &&
			BODYLESS_BEARER_ROUTES.has(`${request.method} ${routePath}`)
		)
			return;
	}
	error(403, `Cross-site ${request.method} form submissions are forbidden`);
}
