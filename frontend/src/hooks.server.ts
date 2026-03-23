import type { Handle } from '@sveltejs/kit';

/**
 * Read Pangolin IAP identity headers and store in a cookie.
 * The cookie is read client-side by the layout to avoid __data.json
 * fetches on navigation (which get blocked by Cloudflare/Pangolin).
 * Falls back to dev defaults when Pangolin is not in front (local dev).
 */
export const handle: Handle = async ({ event, resolve }) => {
  const user = {
    accountId: event.request.headers.get('Remote-Subject') || 'dev-user',
    username: event.request.headers.get('Remote-User') || 'Developer',
    email: event.request.headers.get('Remote-Email') || 'dev@localhost',
  };

  event.cookies.set('spellbook_user', JSON.stringify(user), {
    path: '/',
    httpOnly: false,
    secure: event.url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24,
  });

  return resolve(event);
};
