import { describe, expect, it } from 'vitest';
import { parseQrAuthorizationInput } from '#lib/auth/qr-code.ts';

const origin = 'https://spellbook.test';
const code = 'a'.repeat(43);

describe('QR sign-in link parsing', () => {
	it('accepts this instance approval link, relative link and opaque code', () => {
		for (const value of [
			code,
			` ${code} `,
			`/auth/approve?code=${code}`,
			`${origin}/auth/approve?code=${code}`
		]) {
			expect(parseQrAuthorizationInput(value, origin)).toBe(code);
		}
	});
	it('rejects foreign instances, credentials, other routes and unexpected payloads', () => {
		for (const value of [
			`https://foreign.test/auth/approve?code=${code}`,
			`https://user:password@spellbook.test/auth/approve?code=${code}`,
			`${origin}/auth/login?code=${code}`,
			`${origin}/auth/approve?code=${code}&code=${code}`,
			`${origin}/auth/approve?code=${code}&returnTo=/settings`,
			`${origin}/auth/approve?code=${code}#approve`,
			'javascript:alert(1)',
			'not a request',
			'a'.repeat(42)
		])
			expect(parseQrAuthorizationInput(value, origin)).toBeNull();
	});
});
