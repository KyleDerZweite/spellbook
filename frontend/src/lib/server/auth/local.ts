import { error, type RequestEvent } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { RemoteError } from '#lib/server/remote/errors.ts';
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
export async function authenticate(...args: Parameters<typeof application.auth.authenticate>) {
	try {
		return await application.auth.authenticate(...args);
	} catch (cause) {
		if (cause instanceof RemoteError && cause.status === 429) error(429, cause.message);
		throw cause;
	}
}
