import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PHASE_RS_URL,
	PHASE_RS_URL_STORAGE_KEY,
	getPhaseRsUrl,
	getSavedPhaseRsUrl,
	normalizePhaseRsUrl,
	savePhaseRsUrl
} from '../../src/lib/phase-rs.ts';

function memoryStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		}
	};
}

describe('phase.rs URL configuration', () => {
	it('defaults to https://phase-rs.dev when unset', () => {
		const storage = memoryStorage();
		expect(getSavedPhaseRsUrl(storage)).toBe('');
		expect(getPhaseRsUrl(storage)).toBe(DEFAULT_PHASE_RS_URL);
		expect(DEFAULT_PHASE_RS_URL).toBe('https://phase-rs.dev');
	});

	it('preserves path and query trailing slashes while normalizing bare origins', () => {
		const storage = memoryStorage();
		expect(savePhaseRsUrl('  http://localhost:8080/  ', storage)).toBe('http://localhost:8080');
		expect(getSavedPhaseRsUrl(storage)).toBe('http://localhost:8080');
		expect(getPhaseRsUrl(storage)).toBe('http://localhost:8080');
		expect(storage.getItem(PHASE_RS_URL_STORAGE_KEY)).toBe('http://localhost:8080');

		expect(savePhaseRsUrl('https://host.example/phase/', storage)).toBe(
			'https://host.example/phase/'
		);
		expect(savePhaseRsUrl('https://host.example/?path=/', storage)).toBe(
			'https://host.example/?path=/'
		);
	});

	it('clears storage when reset to empty or default URL', () => {
		const storage = memoryStorage();
		savePhaseRsUrl('https://phase.example.com', storage);
		expect(savePhaseRsUrl('', storage)).toBe(DEFAULT_PHASE_RS_URL);
		expect(storage.getItem(PHASE_RS_URL_STORAGE_KEY)).toBeNull();

		savePhaseRsUrl('https://phase.example.com', storage);
		expect(savePhaseRsUrl('https://phase-rs.dev/', storage)).toBe(DEFAULT_PHASE_RS_URL);
		expect(storage.getItem(PHASE_RS_URL_STORAGE_KEY)).toBeNull();
	});

	it('rejects non-http(s), malformed, and over-limit encoded URLs', () => {
		const storage = memoryStorage();
		const encodedOverLimit = `https://host.example/${'雪'.repeat(60)}`;
		for (const bad of [
			'javascript:alert(1)',
			'data:text/html,hi',
			'ftp://phase-rs.dev',
			'not a url',
			encodedOverLimit
		]) {
			expect(normalizePhaseRsUrl(bad)).toBeNull();
			expect(savePhaseRsUrl(bad, storage)).toBeNull();
		}
		expect(getPhaseRsUrl(storage)).toBe(DEFAULT_PHASE_RS_URL);
	});
});
