import { describe, expect, it } from 'vitest';
import { summarizeDashboard } from '../../src/lib/mtg/dashboard';
const entry = (
	id: string,
	quantity: number,
	finish = 'nonfoil',
	condition = 'NM',
	setCode = 'lea',
	catalogCardId = 'printing-a',
	canonicalCardId = 'card-a'
) => ({
	id,
	quantity,
	finish,
	condition,
	setCode,
	catalogCardId,
	canonicalCardId,
	name: id,
	imageUri: '',
	updatedAt: new Date('2026-10-01')
});
describe('dashboard account summary', () => {
	it('weights finish, condition and sets by copies and counts distinct canonical identities and printings', () => {
		const summary = summarizeDashboard(
			[
				entry('a', 4),
				entry('b', 3, 'foil', 'LP'),
				entry('c', 2, 'foil', 'NM', 'm10', 'printing-b'),
				entry('d', 1, 'nonfoil', 'DMG', 'm10', 'printing-c', 'card-b')
			],
			[],
			[]
		);
		expect(summary.totals).toEqual({
			total: 10,
			names: 2,
			printings: 3,
			sets: 2,
			decks: 0,
			foils: 5
		});
		expect(summary.finishes.map((group) => group.quantity)).toEqual([5, 5]);
		expect(summary.conditions.map((group) => group.quantity)).toEqual([6, 3, 0, 0, 1]);
		expect(summary.sets).toEqual([
			{ label: 'lea', quantity: 7, share: 0.7 },
			{ label: 'm10', quantity: 3, share: 0.3 }
		]);
	});
	it('reuses exact-first allocation for each independent deck without consuming inventory', () => {
		const inventory = [entry('owned', 1)];
		const decks = [
			{ id: 'one', name: 'One', format: 'Commander' },
			{ id: 'two', name: 'Two', format: 'Commander' }
		];
		const cards = [
			{
				id: 'a-flex',
				deckId: 'one',
				catalogCardId: 'printing-b',
				canonicalCardId: 'card-a',
				quantity: 1
			},
			{
				id: 'z-exact',
				deckId: 'one',
				catalogCardId: 'printing-a',
				canonicalCardId: 'card-a',
				quantity: 1
			},
			{
				id: 'a-second',
				deckId: 'two',
				catalogCardId: 'printing-b',
				canonicalCardId: 'card-a',
				quantity: 2
			}
		];
		expect(summarizeDashboard(inventory, decks, cards).decks).toMatchObject([
			{ required: 2, exact: 1, alternate: 0, missing: 1 },
			{ required: 2, exact: 0, alternate: 1, missing: 1 }
		]);
		expect(inventory[0].quantity).toBe(1);
	});
	it('returns zero totals and finite shares for an empty inventory', () => {
		const summary = summarizeDashboard([], [], []);
		expect(Object.values(summary.totals)).toEqual([0, 0, 0, 0, 0, 0]);
		expect(summary.finishes.every((group) => group.share === 0)).toBe(true);
		expect(summary.recentEntries).toEqual([]);
	});
	it('shows the eight most recently edited entries', () => {
		const inventory = Array.from({ length: 10 }, (_, index) => ({
			...entry(String(index), 1),
			updatedAt: new Date(2026, 9, index + 1)
		}));
		expect(summarizeDashboard(inventory, [], []).recentEntries.map((card) => card.id)).toEqual([
			'9',
			'8',
			'7',
			'6',
			'5',
			'4',
			'3',
			'2'
		]);
	});
});
