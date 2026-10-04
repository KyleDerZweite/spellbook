import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function normalizeUsername(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const username = value.trim().toLowerCase();
	return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(username) ? username : null;
}

export function validPassword(value: unknown): value is string {
	return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}

function derive(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, 64, OPTIONS, (error, key) => {
			if (error) reject(error);
			else resolve(key);
		});
	});
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex');
	return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
	const encoded = hash ?? DUMMY_HASH;
	if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
	const [, salt, expected] = encoded.split('$');
	const actual = await derive(password, salt!);
	return timingSafeEqual(actual, Buffer.from(expected!, 'hex')) && hash !== null;
}
