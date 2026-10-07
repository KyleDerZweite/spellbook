import { expect, it } from 'vitest';
import { nextDeckChoiceOffset } from '@spellbook/backend/decks/application.ts';

it('returns only supported continuations while keeping the inclusive offset ceiling', () => {
	expect(nextDeckChoiceOffset(0, 20, true)).toBe(20);
	expect(nextDeckChoiceOffset(999990, 10, true)).toBe(1000000);
	expect(nextDeckChoiceOffset(1000000, 1, true)).toBeNull();
	expect(nextDeckChoiceOffset(999980, 50, true)).toBeNull();
	expect(nextDeckChoiceOffset(20, 20, false)).toBeNull();
});
