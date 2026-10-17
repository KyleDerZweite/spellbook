import { error, json, type RequestEvent } from '@sveltejs/kit';
import {
	validQrCredential,
	type QrCreateResponse,
	type QrTokenResponse
} from '@spellbook/contracts/auth.ts';
import { application } from '#lib/server/composition.ts';
import { readJsonObject } from '#lib/server/http/request.ts';
import { requireMobileAuth } from '#lib/server/mobile/auth.ts';
import { SESSION_COOKIE, writeSessionCookie } from './session.ts';

export const QR_REQUESTER_COOKIE = 'spellbook_qr_requester';
const cookiePath = '/api/auth/qr';

function requireOrigin(event: RequestEvent, allowMissing = false) {
	const origin = event.request.headers.get('origin');
	if (origin !== event.url.origin && !(origin === null && allowMissing))
		error(403, 'Invalid request origin');
}

async function body(event: RequestEvent, keys: string[]) {
	const input = await readJsonObject(event.request, 1024);
	if (Object.keys(input).some((key) => !keys.includes(key))) error(400, 'Unknown QR fields');
	return input;
}

async function browserAuthenticated(event: RequestEvent) {
	// Check the target browser's cookie even if an Authorization header is also supplied.
	return !!(await application.auth.validateSession(event.cookies.get(SESSION_COOKIE)));
}

export async function qrResponse(
	event: RequestEvent,
	operation: 'create' | 'inspect' | 'decide' | 'token'
) {
	event.setHeaders({ 'Cache-Control': 'no-store' });
	try {
		// A native caller may omit Origin, but any supplied Origin must match.
		requireOrigin(event, true);
		const address = event.getClientAddress();
		if (operation === 'create') {
			const input = await body(event, ['kind']);
			if (input.kind !== 'browser' && input.kind !== 'device') error(400, 'Invalid QR kind');
			if (input.kind === 'browser') {
				requireOrigin(event);
				if (await browserAuthenticated(event)) error(409, 'This browser is already signed in.');
			}
			const created = await application.auth.qr.create(input.kind, address);
			const { requesterSecret, ...publicRequest } = created;
			if (created.kind === 'browser') {
				event.cookies.set(QR_REQUESTER_COOKIE, `${created.code}.${requesterSecret}`, {
					path: cookiePath,
					httpOnly: true,
					sameSite: 'lax',
					secure: event.url.protocol === 'https:',
					maxAge: 300
				});
			}
			const response: QrCreateResponse = {
				...publicRequest,
				verificationUri: new URL(`/auth/qr?code=${created.code}`, event.url.origin).href,
				...(created.kind === 'device' ? { requesterSecret } : {})
			};
			return json(response, { status: 201 });
		}
		if (operation === 'inspect' || operation === 'decide') {
			const { user } = await requireMobileAuth(event);
			const code = event.params.code;
			if (!validQrCredential(code)) error(400, 'Invalid QR code');
			if (operation === 'inspect')
				return json(await application.auth.qr.inspect(user, code, address));
			const input = await body(event, ['decision']);
			if (input.decision !== 'approve' && input.decision !== 'deny')
				error(400, 'Invalid QR decision');
			return json(await application.auth.qr.decide(user, code, input.decision, address));
		}
		const input = await body(event, ['code', 'requesterSecret']);
		if (!validQrCredential(input.code)) error(400, 'Invalid QR code');
		const requesterSecret = input.requesterSecret;
		if (requesterSecret !== undefined && !validQrCredential(requesterSecret))
			error(400, 'Invalid requester secret');
		const cookie = event.cookies.get(QR_REQUESTER_COOKIE)?.split('.');
		const browserSecret =
			cookie?.length === 2 && cookie[0] === input.code && validQrCredential(cookie[1])
				? cookie[1]
				: undefined;
		if (browserSecret) requireOrigin(event);
		const result = await application.auth.qr.redeem(
			input.code,
			{
				requesterSecret,
				browserSecret,
				browserAuthenticated: await browserAuthenticated(event)
			},
			address
		);
		if (result.status !== 'authenticated') {
			if (result.kind === 'browser' && result.status !== 'pending')
				event.cookies.delete(QR_REQUESTER_COOKIE, { path: cookiePath });
			return json({ status: result.status } satisfies QrTokenResponse);
		}
		if (result.kind === 'browser') {
			writeSessionCookie(event.cookies, result.session.token, event.url);
			event.cookies.delete(QR_REQUESTER_COOKIE, { path: cookiePath });
		}
		return json({
			status: 'authenticated',
			expiresAt: result.session.expiresAt,
			...(result.kind === 'device' ? { token: result.session.token } : {})
		} satisfies QrTokenResponse);
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'kind' in cause) {
			const statuses = {
				ValidationFailed: 400,
				Unauthenticated: 401,
				NotFound: 404,
				Conflict: 409,
				RateLimited: 429
			} as const;
			if (typeof cause.kind === 'string' && Object.hasOwn(statuses, cause.kind))
				return json(
					{
						kind: cause.kind,
						message: cause instanceof Error ? cause.message : 'QR request failed'
					},
					{ status: statuses[cause.kind as keyof typeof statuses] }
				);
		}
		throw cause;
	}
}
