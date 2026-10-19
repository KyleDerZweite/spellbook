import { error, type RequestEvent } from '@sveltejs/kit';
export function sanitizeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(value))
		return '/mtg/inventory';
	return value;
}
export function requireSameOrigin(
	event: Pick<RequestEvent, 'request' | 'url'>,
	allowMissing = false
) {
	const origin = event.request.headers.get('origin');
	if ((!origin && !allowMissing) || (origin && origin !== event.url.origin))
		error(403, 'Invalid request origin');
}
