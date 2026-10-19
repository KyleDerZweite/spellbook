import { SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from '../auth/session.ts';
export { SESSION_COOKIE } from '../auth/session.ts';

export const QR_REQUESTER_COOKIE = 'spellbook_qr_requester';
export const QR_COOKIE_PATH = '/api/auth/qr';

export function readCookie(request: Request, name: string): string | undefined {
	for (const item of (request.headers.get('cookie') ?? '').split(';')) {
		const separator = item.indexOf('=');
		if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
		try {
			return decodeURIComponent(item.slice(separator + 1).trim());
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function cookie(name: string, value: string, path: string, maxAge: number, publicOrigin: string) {
	return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${new URL(publicOrigin).protocol === 'https:' ? '; Secure' : ''}`;
}

export function writeSessionCookie(headers: Headers, token: string, publicOrigin: string): void {
	headers.append(
		'Set-Cookie',
		cookie(SESSION_COOKIE, token, '/', SESSION_LIFETIME_SECONDS, publicOrigin)
	);
}

export function clearSessionCookie(headers: Headers, publicOrigin: string): void {
	headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', '/', 0, publicOrigin));
}

export function writeQrCookie(
	headers: Headers,
	code: string,
	secret: string,
	publicOrigin: string
): void {
	headers.append(
		'Set-Cookie',
		cookie(QR_REQUESTER_COOKIE, `${code}.${secret}`, QR_COOKIE_PATH, 300, publicOrigin)
	);
}

export function clearQrCookie(headers: Headers, publicOrigin: string): void {
	headers.append('Set-Cookie', cookie(QR_REQUESTER_COOKIE, '', QR_COOKIE_PATH, 0, publicOrigin));
}
