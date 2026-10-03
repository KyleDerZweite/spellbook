import { error, type RequestEvent } from '@sveltejs/kit';
import { getBearerToken } from './session';

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);

const BODYLESS_BEARER_ROUTES = new Set([
	'DELETE /api/mobile/v1/mtg/decks/[deckId]',
	'DELETE /api/mobile/v1/mtg/deck-cards/[entryId]',
	'DELETE /api/mobile/v1/mtg/inventory/[entryId]',
	'POST /api/mobile/v1/mtg/scan/sessions',
	'POST /api/auth/logout'
]);

export function requireFormOrigin(event: Pick<RequestEvent, 'request' | 'url' | 'route'>): void {
	const { request, url } = event;
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (contentType && !FORM_CONTENT_TYPES.has(contentType)) return;
	const origin = request.headers.get('origin');
	if (origin === url.origin) return;
	// Native clients have no Origin. These routes use only the presented bearer token,
	// so an invalid token cannot fall back to cookie authentication.
	if (origin === null && getBearerToken(request)) {
		if (
			request.method === 'POST' &&
			contentType === 'multipart/form-data' &&
			event.route.id === '/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames'
		)
			return;
		if (
			!contentType &&
			request.body === null &&
			BODYLESS_BEARER_ROUTES.has(`${request.method} ${event.route.id}`)
		)
			return;
	}
	error(403, `Cross-site ${request.method} form submissions are forbidden`);
}
