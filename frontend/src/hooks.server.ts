import type { Handle } from '@sveltejs/kit';

/**
 * Read Pangolin IAP identity headers and make them available in locals.
 * Falls back to dev defaults when Pangolin is not in front (local dev).
 */
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = {
    accountId: event.request.headers.get('Remote-Subject') || 'dev-user',
    username: event.request.headers.get('Remote-User') || 'Developer',
    email: event.request.headers.get('Remote-Email') || 'dev@localhost',
  };
  return resolve(event);
};
