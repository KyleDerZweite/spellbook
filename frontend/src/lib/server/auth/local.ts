import { error, type RequestEvent } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { AuthError } from '@spellbook/backend/auth/local.ts';
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

function translate(cause: unknown): never {
	if (cause instanceof AuthError) error(429, cause.message);
	throw cause;
}
export function takeAuthAttempt(...args: Parameters<typeof application.auth.takeAuthAttempt>) {
	try {
		return application.auth.takeAuthAttempt(...args);
	} catch (cause) {
		translate(cause);
	}
}
export async function withPasswordDerivation<T>(operation: () => Promise<T>) {
	try {
		return await application.auth.withPasswordDerivation(operation);
	} catch (cause) {
		translate(cause);
	}
}
export async function authenticate(...args: Parameters<typeof application.auth.authenticate>) {
	try {
		return await application.auth.authenticate(...args);
	} catch (cause) {
		translate(cause);
	}
}
