import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthUser } from '$lib/auth/types';
import type { AuthSession } from './session';

export interface ZitadelAuthConfig {
	issuer: string;
	clientId: string;
	appOrigin: string;
}

interface ZitadelMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint: string;
	end_session_endpoint?: string;
	jwks_uri: string;
}

interface TokenResponse {
	access_token?: string;
	id_token?: string;
	refresh_token?: string;
	expires_in?: number;
	token_type?: string;
}

const metadataCache = new Map<string, Promise<ZitadelMetadata>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const encoder = new TextEncoder();

export function getZitadelAuthConfig(env: Record<string, string | undefined>): ZitadelAuthConfig {
	const issuer = env.ZITADEL_ISSUER?.trim();
	const clientId = env.ZITADEL_CLIENT_ID?.trim();
	const appOrigin = env.APP_ORIGIN?.trim();

	if (!issuer || !clientId || !appOrigin) {
		throw new Error(
			'ZITADEL_ISSUER, ZITADEL_CLIENT_ID, and APP_ORIGIN must be configured for direct auth'
		);
	}

	return {
		issuer: issuer.replace(/\/+$/, ''),
		clientId,
		appOrigin: appOrigin.replace(/\/+$/, '')
	};
}

export function sanitizeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/mtg/search';
	}

	return value;
}

export function createRandomString(byteLength = 32): string {
	const random = new Uint8Array(byteLength);
	crypto.getRandomValues(random);
	return Buffer.from(random).toString('base64url');
}

async function getMetadata(config: ZitadelAuthConfig): Promise<ZitadelMetadata> {
	let cached = metadataCache.get(config.issuer);
	if (!cached) {
		cached = fetch(`${config.issuer}/.well-known/openid-configuration`, {
			headers: { Accept: 'application/json' }
		}).then(async (response) => {
			if (!response.ok) {
				throw new Error(
					`Failed to load Zitadel OIDC metadata: ${response.status} ${response.statusText}`
				);
			}

			return (await response.json()) as ZitadelMetadata;
		});
		metadataCache.set(config.issuer, cached);
	}

	return cached;
}

function getJwks(metadata: ZitadelMetadata) {
	let jwks = jwksCache.get(metadata.jwks_uri);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
		jwksCache.set(metadata.jwks_uri, jwks);
	}

	return jwks;
}

function getRedirectUri(config: ZitadelAuthConfig): string {
	return `${config.appOrigin}/auth/callback`;
}

async function buildCodeChallenge(codeVerifier: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
	return Buffer.from(digest).toString('base64url');
}

async function callTokenEndpoint(
	config: ZitadelAuthConfig,
	body: URLSearchParams
): Promise<TokenResponse> {
	const metadata = await getMetadata(config);
	const response = await fetch(metadata.token_endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body
	});

	if (!response.ok) {
		const detail = await response.text();
		throw new Error(
			`Zitadel token exchange failed: ${response.status} ${response.statusText} ${detail}`
		);
	}

	return (await response.json()) as TokenResponse;
}

async function fetchUserInfo(
	config: ZitadelAuthConfig,
	accessToken: string | undefined,
	fallbackSubject: string
): Promise<AuthUser> {
	if (!accessToken) {
		return {
			accountId: fallbackSubject,
			username: fallbackSubject.slice(0, 12),
			email: ''
		};
	}

	const metadata = await getMetadata(config);
	const response = await fetch(metadata.userinfo_endpoint, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});

	if (!response.ok) {
		return {
			accountId: fallbackSubject,
			username: fallbackSubject.slice(0, 12),
			email: ''
		};
	}

	const payload = (await response.json()) as Record<string, unknown>;
	return {
		accountId: String(payload['sub'] ?? fallbackSubject),
		username: String(
			payload['preferred_username'] ??
				payload['name'] ??
				payload['email'] ??
				fallbackSubject.slice(0, 12)
		),
		email: String(payload['email'] ?? '')
	};
}

async function createSessionFromTokens(
	config: ZitadelAuthConfig,
	tokens: TokenResponse,
	expectedNonce?: string
): Promise<AuthSession> {
	if (!tokens.id_token) {
		throw new Error('Zitadel token response did not include an id_token');
	}

	const metadata = await getMetadata(config);
	const { payload } = await jwtVerify(tokens.id_token, getJwks(metadata), {
		issuer: metadata.issuer,
		audience: config.clientId
	});

	if (expectedNonce && payload.nonce !== expectedNonce) {
		throw new Error('Zitadel nonce validation failed');
	}

	const subject = String(payload.sub ?? '');
	if (!subject) {
		throw new Error('Zitadel id_token did not contain a subject');
	}

	const user =
		payload.preferred_username || payload.email
			? {
					accountId: subject,
					username: String(
						payload.preferred_username ?? payload.name ?? payload.email ?? subject.slice(0, 12)
					),
					email: String(payload.email ?? '')
				}
			: await fetchUserInfo(config, tokens.access_token, subject);

	const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now();
	const fallbackExpires = Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000;

	return {
		user,
		idToken: tokens.id_token,
		refreshToken: tokens.refresh_token ?? null,
		expiresAt: Math.max(exp, fallbackExpires)
	};
}

export async function verifyBearerToken(
	config: ZitadelAuthConfig,
	token: string
): Promise<{ user: AuthUser; expiresAt: number }> {
	const metadata = await getMetadata(config);
	const { payload } = await jwtVerify(token, getJwks(metadata), {
		issuer: metadata.issuer,
		audience: config.clientId
	});

	const subject = String(payload.sub ?? '');
	if (!subject) {
		throw new Error('Zitadel bearer token did not contain a subject');
	}

	const user =
		payload.preferred_username || payload.email
			? {
					accountId: subject,
					username: String(
						payload.preferred_username ?? payload.name ?? payload.email ?? subject.slice(0, 12)
					),
					email: String(payload.email ?? '')
				}
			: await fetchUserInfo(config, undefined, subject);

	return {
		user,
		expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now()
	};
}

export async function buildAuthorizationUrl(
	config: ZitadelAuthConfig,
	options: {
		state: string;
		nonce: string;
		codeVerifier: string;
	}
): Promise<string> {
	const metadata = await getMetadata(config);
	const challenge = await buildCodeChallenge(options.codeVerifier);
	const url = new URL(metadata.authorization_endpoint);
	url.searchParams.set('client_id', config.clientId);
	url.searchParams.set('redirect_uri', getRedirectUri(config));
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', 'openid profile email offline_access');
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', 'S256');
	url.searchParams.set('state', options.state);
	url.searchParams.set('nonce', options.nonce);
	url.searchParams.set('prompt', 'login');
	return url.toString();
}

export async function exchangeAuthorizationCode(
	config: ZitadelAuthConfig,
	options: {
		code: string;
		codeVerifier: string;
		expectedNonce: string;
	}
): Promise<AuthSession> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: options.code,
		redirect_uri: getRedirectUri(config),
		client_id: config.clientId,
		code_verifier: options.codeVerifier
	});

	const tokens = await callTokenEndpoint(config, body);
	return createSessionFromTokens(config, tokens, options.expectedNonce);
}

export async function refreshAuthSession(
	config: ZitadelAuthConfig,
	session: AuthSession
): Promise<AuthSession> {
	if (!session.refreshToken) {
		throw new Error('No refresh token available');
	}

	const body = new URLSearchParams({
		grant_type: 'refresh_token',
		refresh_token: session.refreshToken,
		client_id: config.clientId
	});

	const tokens = await callTokenEndpoint(config, body);
	return createSessionFromTokens(config, {
		...tokens,
		refresh_token: tokens.refresh_token ?? session.refreshToken
	});
}

export async function buildLogoutUrl(
	config: ZitadelAuthConfig,
	idTokenHint?: string
): Promise<string> {
	const metadata = await getMetadata(config);
	if (!metadata.end_session_endpoint) {
		return `${config.appOrigin}/`;
	}

	const url = new URL(metadata.end_session_endpoint);
	url.searchParams.set('post_logout_redirect_uri', `${config.appOrigin}/`);
	if (idTokenHint) {
		url.searchParams.set('id_token_hint', idTokenHint);
	}
	return url.toString();
}
