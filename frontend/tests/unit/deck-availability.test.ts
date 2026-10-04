import { describe, expect, it } from 'vitest';
import { allocateDeckAvailability } from '../../src/lib/mtg/deck-availability';

const card = (id: string, printing: string, quantity: number, canonicalCardId = 'oracle') => ({
	id,
	catalogCardId: printing,
	canonicalCardId,
	quantity
});

describe('deck availability', () => {
	it('allocates duplicate requirements consistently regardless of caller ordering', () => {
		const rows = [card('b', 'printing', 1), card('a', 'printing', 1)];
		const owned = [card('owned', 'printing', 1)];
		expect(allocateDeckAvailability(rows, owned)).toEqual(
			allocateDeckAvailability([...rows].reverse(), owned)
		);
		expect(allocateDeckAvailability(rows, owned).a.exact).toBe(1);
	});

	it('does not allocate an owned copy twice across deck roles', () => {
		expect(
			allocateDeckAvailability(
				[card('main', 'a', 1), card('sideboard', 'a', 1)],
				[card('owned', 'a', 1)]
			)
		).toEqual({
			main: { exact: 1, alternate: 0, missing: 0 },
			sideboard: { exact: 0, alternate: 0, missing: 1 }
		});
	});
	it('reserves all exact printings before assigning alternatives', () => {
		expect(
			allocateDeckAvailability(
				[card('first', 'a', 2), card('second', 'b', 1)],
				[card('owned', 'b', 2)]
			)
		).toEqual({
			first: { exact: 0, alternate: 1, missing: 1 },
			second: { exact: 1, alternate: 0, missing: 0 }
		});
	});
	it('sums conditions and finishes but never unrelated canonical cards', () => {
		expect(
			allocateDeckAvailability(
				[card('entry', 'a', 4)],
				[
					card('foil', 'a', 1),
					card('nonfoil', 'a', 1),
					card('other-printing', 'b', 1),
					card('unrelated', 'c', 10, 'other')
				]
			)
		).toEqual({ entry: { exact: 2, alternate: 1, missing: 1 } });
	});
});
