import type { Cookies } from '@sveltejs/kit';
import { CompactEncrypt, base64url, compactDecrypt } from 'jose';
import type { AuthUser } from '$lib/auth/types';

export interface AuthSession {
	user: AuthUser;
	idToken: string;
	refreshToken: string | null;
	expiresAt: number;
}

export interface OAuthState {
	state: string;
	nonce: string;
	codeVerifier: string;
	returnTo: string;
}

export const OAUTH_STATE_COOKIE = 'spellbook_oauth_state';
export const SESSION_COOKIE = 'spellbook_session';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map<string, Promise<CryptoKey>>();
type CookieOptions = NonNullable<Parameters<Cookies['set']>[2]>;

export function getAuthSessionSecret(env: Record<string, string | undefined>): string {
	const secret = env.AUTH_SESSION_SECRET?.trim();
	if (!secret) {
		throw new Error('AUTH_SESSION_SECRET must be configured for direct auth');
	}

	return secret;
}

function getCookieOptions(maxAge: number): CookieOptions {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge
	};
}

function getEncryptionKey(secret: string): Promise<CryptoKey> {
	let key = keyCache.get(secret);
	if (key) {
		return key;
	}

	key = (async () => {
		const rawKey = new Uint8Array(base64url.decode(secret));
		if (rawKey.length !== 32) {
			throw new Error('AUTH_SESSION_SECRET must decode to exactly 32 bytes');
		}

		return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
	})();

	keyCache.set(secret, key);
	return key;
}

async function seal(payload: AuthSession | OAuthState, secret: string): Promise<string> {
	const key = await getEncryptionKey(secret);
	return new CompactEncrypt(encoder.encode(JSON.stringify(payload)))
		.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
		.encrypt(key);
}

async function unseal<T>(value: string | undefined, secret: string): Promise<T | null> {
	if (!value) {
		return null;
	}

	try {
		const key = await getEncryptionKey(secret);
		const { plaintext } = await compactDecrypt(value, key);
		return JSON.parse(decoder.decode(plaintext)) as T;
	} catch {
		return null;
	}
}

export async function readSessionCookie(
	cookies: Cookies,
	secret: string
): Promise<AuthSession | null> {
	return unseal<AuthSession>(cookies.get(SESSION_COOKIE), secret);
}

export async function writeSessionCookie(
	cookies: Cookies,
	secret: string,
	session: AuthSession
): Promise<void> {
	const token = await seal(session, secret);
	const maxAge = Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000));
	cookies.set(SESSION_COOKIE, token, getCookieOptions(maxAge));
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function readOAuthStateCookie(
	cookies: Cookies,
	secret: string
): Promise<OAuthState | null> {
	return unseal<OAuthState>(cookies.get(OAUTH_STATE_COOKIE), secret);
}

export async function writeOAuthStateCookie(
	cookies: Cookies,
	secret: string,
	state: OAuthState
): Promise<void> {
	const token = await seal(state, secret);
	cookies.set(OAUTH_STATE_COOKIE, token, getCookieOptions(600));
}

export function clearOAuthStateCookie(cookies: Cookies): void {
	cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
}
