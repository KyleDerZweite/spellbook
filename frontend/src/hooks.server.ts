import type { Handle } from '@sveltejs/kit';

/**
 * Read Pangolin IAP headers for user identity.
 * Falls back to dev defaults when headers are absent.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const accountId =
		event.request.headers.get('Remote-Subject') ?? 'dev-user-001';
	const username =
		event.request.headers.get('Remote-User') ?? 'dev';
	const email =
		event.request.headers.get('Remote-Email') ?? 'dev@localhost';

	event.locals.user = { accountId, username, email };

	return resolve(event);
};
