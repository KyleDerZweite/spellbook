import { error, fail, redirect } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { validQrCredential } from '@spellbook/contracts/auth.ts';
import { QrAuthError } from '#lib/server/remote/errors.ts';
import { application } from '#lib/server/composition.ts';
import { requireSameOrigin } from '#lib/server/auth/local.ts';
import { SESSION_COOKIE } from './session.ts';
import type { RequestEvent } from '@sveltejs/kit';

function requestCode(url: URL) {
	const code = url.searchParams.get('code');
	if (!validQrCredential(code) || url.searchParams.getAll('code').length !== 1)
		error(400, 'Invalid sign-in link. Scan a new QR code.');
	return code;
}

function reviewMarker(event: RequestEvent, code: string) {
	const token = event.cookies.get(SESSION_COOKIE);
	if (!token) error(401, 'Sign in before approving this request.');
	// A code-scoped proof binds native and enhanced forms to the exact reviewed session.
	return createHmac('sha256', token).update(`qr-review:${code}`).digest('base64url');
}
const statuses = {
	ValidationFailed: 400,
	Unauthenticated: 401,
	NotFound: 404,
	Conflict: 409,
	RateLimited: 429
} as const;

export async function loadQrApproval(event: RequestEvent) {
	const code = requestCode(event.url);
	if (!event.locals.user)
		redirect(
			303,
			`/auth/login?returnTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	try {
		return {
			request: await application.auth.qr.inspect(event.locals.user, code, event.getClientAddress()),
			origin: event.url.origin,
			review: reviewMarker(event, code),
			reviewedUsername: event.locals.user.username
		};
	} catch (cause) {
		if (cause instanceof QrAuthError) error(statuses[cause.kind], cause.message);
		throw cause;
	}
}

export async function submitQrApproval(event: RequestEvent) {
	requireSameOrigin(event);
	const code = requestCode(event.url);
	if (!event.locals.user)
		redirect(
			303,
			`/auth/login?returnTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	const form = await event.request.formData();
	const decision = form.get('decision');
	const review = form.get('review');
	if (form.getAll('decision').length !== 1 || (decision !== 'approve' && decision !== 'deny'))
		return fail(400, { message: 'Choose Approve sign-in or Deny.' });
	if (
		form.getAll('review').length !== 1 ||
		!validQrCredential(review) ||
		!timingSafeEqual(Buffer.from(review), Buffer.from(reviewMarker(event, code)))
	)
		return fail(409, {
			message: 'Your sign-in session changed. Review the account shown before approving again.'
		});
	try {
		return {
			request: await application.auth.qr.decide(
				event.locals.user,
				code,
				decision,
				event.getClientAddress()
			)
		};
	} catch (cause) {
		if (cause instanceof QrAuthError) return fail(statuses[cause.kind], { message: cause.message });
		throw cause;
	}
}
