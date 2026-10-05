import { describe, expect, it } from 'vitest';
import { load } from '../../src/routes/+layout.server';
import { isAvailableGame } from '../../src/lib/state/activeGame.svelte';

describe('available game selection', () => {
	it.each(['pokemon', 'yugioh', 'invalid', undefined])(
		'normalizes unsupported cookie %s to MTG',
		async (game) => {
			const result = await load({ locals: { user: null }, cookies: { get: () => game } } as never);
			expect(result).toMatchObject({ activeGame: 'mtg' });
			expect(isAvailableGame(game)).toBe(false);
		}
	);
	it('accepts MTG as the only enabled game', () => {
		expect(isAvailableGame('mtg')).toBe(true);
	});
});
