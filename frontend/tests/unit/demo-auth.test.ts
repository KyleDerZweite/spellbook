import { describe, expect, it } from 'vitest';
import { acceptsDemoLogin } from '../../src/lib/server/auth/demo';
import { validPassword } from '../../src/lib/server/auth/password';

describe('demo credentials', () => {
	it('only allows the exact demo login in explicit demo mode', () => {
		expect(acceptsDemoLogin('login', 'demo', 'demo', true)).toBe(true);
		expect(acceptsDemoLogin('login', 'demo', 'demo', false)).toBe(false);
		expect(acceptsDemoLogin('register', 'demo', 'demo', true)).toBe(false);
		expect(acceptsDemoLogin('login', 'other', 'demo', true)).toBe(false);
		expect(acceptsDemoLogin('login', 'demo', 'wrong', true)).toBe(false);
		expect(validPassword('demo')).toBe(false);
	});
});

import { readFileSync } from 'node:fs';
import { generateLegalityWarnings } from '../../src/lib/server/mtg/legality';
import type { CardDocument } from '../../src/lib/search/types';

it('ships demo card records usable by format checks, including cards without rules text', () => {
	const cards = JSON.parse(
		readFileSync(new URL('../../scripts/demo/cards.json', import.meta.url), 'utf8')
	) as CardDocument[];
	expect(() =>
		generateLegalityWarnings(
			cards.map((card) => ({ card, role: 'main' as const, quantity: 1 })),
			'Commander'
		)
	).not.toThrow();
	const solRings = cards.filter((card) => card.name === 'Sol Ring');
	expect(new Set(solRings.map((card) => card.id)).size).toBe(2);
	expect(new Set(solRings.map((card) => card.oracle_id)).size).toBe(1);
});
