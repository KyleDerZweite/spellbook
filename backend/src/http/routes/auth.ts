import {
	validQrCredential,
	type QrCreateResponse,
	type QrTokenResponse
} from '@spellbook/contracts/auth.ts';
import { AuthError } from '../../auth/local.ts';
import { QrAuthError } from '../../auth/qr.ts';
import { getBearerToken, requireMobileAuth, requireSameOrigin } from '../auth.ts';
import {
	clearQrCookie,
	QR_REQUESTER_COOKIE,
	readCookie,
	SESSION_COOKIE,
	writeQrCookie,
	writeSessionCookie
} from '../cookies.ts';
import { error, json } from '../errors.ts';
import { readFormData, readJsonObject } from '../request.ts';
import type { HttpDependencies, HttpRoute, RouteContext } from '../types.ts';

export function createAuthRoutes(dependencies: HttpDependencies): HttpRoute[] {
	const { application, publicOrigin } = dependencies;
	async function authenticateForm(context: RouteContext, mode: 'login' | 'register') {
		requireSameOrigin(context, dependencies);
		try {
			application.auth.takeAuthAttempt(context.clientAddress);
			const data = await readFormData(context.request);
			const username = data.get('username');
			const artworkId = data.get('artworkId');
			const preferences = data.has('artworkId') ? { artworkId } : {};
			const authenticated = await application.auth.authenticate(
				mode,
				username,
				data.get('password'),
				preferences
			);
			if (!authenticated)
				return json(
					{
						message:
							mode === 'login'
								? 'Invalid username or password.'
								: 'Unable to create an account with those details.',
						username: typeof username === 'string' ? username : '',
						...(mode === 'register'
							? { artworkId: typeof artworkId === 'string' ? artworkId : '' }
							: {})
					},
					{ status: 400 }
				);
			const { user, session } = authenticated;
			return json({ user, token: session.token, expiresAt: session.expiresAt });
		} catch (cause) {
			if (cause instanceof AuthError) error(429, cause.message);
			throw cause;
		}
	}
	async function authenticate(context: RouteContext, mode: 'login' | 'register') {
		requireSameOrigin(context, dependencies, true);
		try {
			application.auth.takeAuthAttempt(context.clientAddress);
			const body = await readJsonObject(context.request);
			const preferences = Object.hasOwn(body, 'artworkId') ? { artworkId: body.artworkId } : {};
			const authenticated = await application.auth.authenticate(
				mode,
				body.username,
				body.password,
				preferences
			);
			if (!authenticated)
				error(
					mode === 'login' ? 401 : 400,
					mode === 'login'
						? 'Invalid username or password'
						: 'Unable to create an account with those details'
				);
			const { user, session } = authenticated;
			return json(
				{ user, token: session.token, expiresAt: session.expiresAt },
				{
					status: mode === 'register' ? 201 : 200,
					headers: { 'Cache-Control': 'no-store' }
				}
			);
		} catch (cause) {
			if (cause instanceof AuthError) error(429, cause.message);
			throw cause;
		}
	}
	async function body(context: RouteContext, keys: string[]) {
		const input = await readJsonObject(context.request, 1024);
		if (Object.keys(input).some((key) => !keys.includes(key))) error(400, 'Unknown QR fields');
		return input;
	}
	async function browserAuthenticated(context: RouteContext) {
		return !!(await application.auth.validateSession(readCookie(context.request, SESSION_COOKIE)));
	}
	async function qr(context: RouteContext, operation: 'create' | 'inspect' | 'decide' | 'token') {
		const headers = new Headers({ 'Cache-Control': 'no-store' });
		try {
			requireSameOrigin(context, dependencies, true);
			const address = context.clientAddress;
			if (operation === 'create') {
				const input = await body(context, ['kind']);
				if (input.kind !== 'browser' && input.kind !== 'device') error(400, 'Invalid QR kind');
				if (input.kind === 'browser') {
					requireSameOrigin(context, dependencies);
					if (await browserAuthenticated(context)) error(409, 'This browser is already signed in.');
				}
				const created = await application.auth.qr.create(input.kind, address);
				const { requesterSecret, ...publicRequest } = created;
				if (created.kind === 'browser')
					writeQrCookie(headers, created.code, requesterSecret, publicOrigin);
				const response: QrCreateResponse = {
					...publicRequest,
					verificationUri: new URL(`/auth/approve?code=${created.code}`, publicOrigin).href,
					...(created.kind === 'device' ? { requesterSecret } : {})
				};
				return json(response, { status: 201, headers });
			}
			if (operation === 'inspect' || operation === 'decide') {
				const { user } = await requireMobileAuth(context, dependencies);
				const code = context.params.code;
				if (!validQrCredential(code)) error(400, 'Invalid QR code');
				if (operation === 'inspect')
					return json(await application.auth.qr.inspect(user, code, address), { headers });
				const input = await body(context, ['decision']);
				if (input.decision !== 'approve' && input.decision !== 'deny')
					error(400, 'Invalid QR decision');
				return json(await application.auth.qr.decide(user, code, input.decision, address), {
					headers
				});
			}
			const input = await body(context, ['code', 'requesterSecret']);
			if (!validQrCredential(input.code)) error(400, 'Invalid QR code');
			const requesterSecret = input.requesterSecret;
			if (requesterSecret !== undefined && !validQrCredential(requesterSecret))
				error(400, 'Invalid requester secret');
			const cookie = readCookie(context.request, QR_REQUESTER_COOKIE)?.split('.');
			const browserSecret =
				cookie?.length === 2 && cookie[0] === input.code && validQrCredential(cookie[1])
					? cookie[1]
					: undefined;
			if (browserSecret) requireSameOrigin(context, dependencies);
			const result = await application.auth.qr.redeem(
				input.code,
				{
					requesterSecret,
					browserSecret,
					browserAuthenticated: await browserAuthenticated(context)
				},
				address
			);
			if (result.status !== 'authenticated') {
				if (result.kind === 'browser' && result.status !== 'pending')
					clearQrCookie(headers, publicOrigin);
				return json({ status: result.status } satisfies QrTokenResponse, { headers });
			}
			if (result.kind === 'browser') {
				writeSessionCookie(headers, result.session.token, publicOrigin);
				clearQrCookie(headers, publicOrigin);
			}
			return json(
				{
					status: 'authenticated',
					expiresAt: result.session.expiresAt,
					...(result.kind === 'device' ? { token: result.session.token } : {})
				} satisfies QrTokenResponse,
				{ headers }
			);
		} catch (cause) {
			if (cause instanceof QrAuthError) {
				const statuses = {
					ValidationFailed: 400,
					Unauthenticated: 401,
					NotFound: 404,
					Conflict: 409,
					RateLimited: 429
				};
				return json(
					{ kind: cause.kind, message: cause.message },
					{ status: statuses[cause.kind], headers }
				);
			}
			throw cause;
		}
	}
	return [
		{
			method: 'POST',
			path: '/api/web/v1/auth/login',
			handle: (context) => authenticateForm(context, 'login')
		},
		{
			method: 'POST',
			path: '/api/web/v1/auth/register',
			handle: (context) => authenticateForm(context, 'register')
		},
		{
			method: 'POST',
			path: '/api/auth/login',
			handle: (context) => authenticate(context, 'login')
		},
		{
			method: 'POST',
			path: '/api/auth/register',
			handle: (context) => authenticate(context, 'register')
		},
		{
			method: 'POST',
			path: '/api/auth/logout',
			async handle(context) {
				requireSameOrigin(context, dependencies, true);
				const token = getBearerToken(context.request);
				if (!token) error(401, 'Bearer token required');
				await application.auth.revokeSession(token);
				return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
			}
		},
		{ method: 'POST', path: '/api/auth/qr/requests', handle: (context) => qr(context, 'create') },
		{
			method: 'GET',
			path: '/api/auth/qr/requests/:code',
			handle: (context) => qr(context, 'inspect')
		},
		{
			method: 'POST',
			path: '/api/auth/qr/requests/:code/decision',
			handle: (context) => qr(context, 'decide')
		},
		{ method: 'POST', path: '/api/auth/qr/token', handle: (context) => qr(context, 'token') }
	];
}
