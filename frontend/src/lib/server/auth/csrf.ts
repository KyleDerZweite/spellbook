import { error, type RequestEvent } from '@sveltejs/kit';
import { getBearerToken } from './session';

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);

export function requireFormOrigin(event: Pick<RequestEvent, 'request' | 'url' | 'route'>): void {
	const { request, url } = event;
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (!contentType || !FORM_CONTENT_TYPES.has(contentType)) return;
	const origin = request.headers.get('origin');
	if (origin === url.origin) return;
	// Native scanners have no Origin. The route must authenticate this bearer token,
	// including when a session cookie is also present; cookie authentication cannot bypass this guard.
	if (
		origin === null &&
		request.method === 'POST' &&
		contentType === 'multipart/form-data' &&
		event.route.id === '/api/mobile/v1/mtg/scan/sessions/[sessionId]/frames' &&
		getBearerToken(request)
	)
		return;
	error(403, `Cross-site ${request.method} form submissions are forbidden`);
}
