import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = {
    accountId: event.request.headers.get('Remote-Subject') || 'dev-user',
    username: event.request.headers.get('Remote-User') || 'Developer',
    email: event.request.headers.get('Remote-Email') || 'dev@localhost',
  };
  return resolve(event);
};
