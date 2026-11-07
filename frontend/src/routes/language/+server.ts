import { error, redirect, json } from '@sveltejs/kit';
import { isLocale, LOCALE_COOKIE } from '#lib/i18n/locale.ts';
import { requireSameOrigin, sanitizeReturnTo } from '#lib/server/auth/local.ts';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async (event) => {
	requireSameOrigin(event);
	const data = await event.request.formData();
	const locale = data.get('locale');
	if (!isLocale(locale)) error(400, 'Unsupported website language');
	event.cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		sameSite: 'lax',
		httpOnly: true,
		secure: event.url.protocol === 'https:',
		maxAge: 60 * 60 * 24 * 365
	});
	if (event.request.headers.get('accept') === 'application/json') return json({ locale });
	const returnTo = data.get('returnTo');
	redirect(303, sanitizeReturnTo(typeof returnTo === 'string' ? returnTo : '/'));
};
