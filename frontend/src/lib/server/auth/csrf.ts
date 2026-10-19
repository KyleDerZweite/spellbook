import { error, type RequestEvent } from '@sveltejs/kit';

const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata'
]);

/** API requests go directly to the API's Origin guard. This guard owns framework forms. */
export function requireFormOrigin(event: Pick<RequestEvent, 'request' | 'url'>): void {
	const { request, url } = event;
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (contentType && !FORM_CONTENT_TYPES.has(contentType)) return;
	if (request.headers.get('origin') === url.origin) return;
	error(403, `Cross-site ${request.method} form submissions are forbidden`);
}
