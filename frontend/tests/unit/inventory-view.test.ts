import { describe, expect, it } from 'vitest';
import {
	describeInventoryOrder,
	filterInventory,
	inventorySetColor,
	nextInventoryOrder,
	orderInventory,
	type InventoryFilters,
	type InventoryOrder
} from '../../src/lib/mtg/inventory-view.ts';

const initial: InventoryOrder = { base: 'name', direction: 'asc', variant: null };
const all: InventoryFilters = { query: '', set: 'all', finish: 'all', condition: 'all' };
function entry(
	id: string,
	overrides: Partial<{
		name: string;
		setCode: string;
		finish: string;
		condition: string;
		quantity: number;
		notes: string;
		catalogCardId: string;
		updatedAt: Date;
	}> = {}
) {
	return {
		id,
		name: id,
		setCode: 'a',
		finish: 'nonfoil',
		condition: 'NM',
		quantity: 1,
		notes: '',
		catalogCardId: id,
		updatedAt: new Date('2026-10-01'),
		...overrides
	};
}
const cards = [
	entry('z-nonfoil', { name: 'Zulu', quantity: 10 }),
	entry('a-foil', { name: 'Alpha', finish: 'foil', condition: 'DMG', quantity: 2 }),
	entry('a-nonfoil', { name: 'Alpha', condition: 'HP', quantity: 2 }),
	entry('z-foil', { name: 'Zulu', finish: 'foil', condition: 'LP', quantity: 10 }),
	entry('b-other', { name: 'Beta', setCode: 'b', condition: 'MP', quantity: 3 })
];
const ids = (order: InventoryOrder) => orderInventory(cards, order).map((card) => card.id);

describe('inventory column ordering', () => {
	it('starts by name and reverses card names on the next Card click', () => {
		expect(ids(initial)).toEqual(['a-foil', 'a-nonfoil', 'b-other', 'z-foil', 'z-nonfoil']);
		expect(ids(nextInventoryOrder(initial, 'name'))).toEqual([
			'z-foil',
			'z-nonfoil',
			'b-other',
			'a-foil',
			'a-nonfoil'
		]);
	});
	it('partitions by Finish before name and preserves the current name direction inside partitions', () => {
		const finish = nextInventoryOrder(initial, 'finish');
		expect(ids(finish)).toEqual(['a-nonfoil', 'b-other', 'z-nonfoil', 'a-foil', 'z-foil']);
		expect(ids(nextInventoryOrder(finish, 'finish'))).toEqual([
			'a-foil',
			'z-foil',
			'a-nonfoil',
			'b-other',
			'z-nonfoil'
		]);
		expect(ids(nextInventoryOrder(nextInventoryOrder(initial, 'name'), 'finish'))).toEqual([
			'z-nonfoil',
			'b-other',
			'a-nonfoil',
			'z-foil',
			'a-foil'
		]);
	});
	it('reverses only Set groups and keeps variant partitions inside their own sets', () => {
		const sets = nextInventoryOrder(initial, 'set');
		expect(ids(nextInventoryOrder(sets, 'set'))).toEqual([
			'b-other',
			'a-foil',
			'a-nonfoil',
			'z-foil',
			'z-nonfoil'
		]);
		const variants = nextInventoryOrder(nextInventoryOrder(sets, 'set'), 'finish');
		expect(ids(variants)).toEqual(['b-other', 'a-nonfoil', 'z-nonfoil', 'a-foil', 'z-foil']);
		expect(ids(nextInventoryOrder(variants, 'finish'))).toEqual([
			'b-other',
			'a-foil',
			'z-foil',
			'a-nonfoil',
			'z-nonfoil'
		]);
	});
	it('orders Condition by physical grade rather than alphabetical label', () => {
		const condition = nextInventoryOrder(initial, 'condition');
		expect(ids(condition)).toEqual(['z-nonfoil', 'z-foil', 'b-other', 'a-nonfoil', 'a-foil']);
		expect(ids(nextInventoryOrder(condition, 'condition'))).toEqual([
			'a-foil',
			'a-nonfoil',
			'b-other',
			'z-foil',
			'z-nonfoil'
		]);
	});
	it('orders Quantity numerically in both directions', () => {
		const quantity = nextInventoryOrder(initial, 'quantity');
		expect(ids(quantity)).toEqual(['a-foil', 'a-nonfoil', 'b-other', 'z-foil', 'z-nonfoil']);
		expect(ids(nextInventoryOrder(quantity, 'quantity'))).toEqual([
			'z-foil',
			'z-nonfoil',
			'b-other',
			'a-foil',
			'a-nonfoil'
		]);
	});
	it('clears variants when choosing a base and replaces variants without changing the base', () => {
		const finish = nextInventoryOrder(nextInventoryOrder(initial, 'set'), 'finish');
		expect(nextInventoryOrder(finish, 'set')).toEqual({
			base: 'set',
			direction: 'desc',
			variant: null
		});
		expect(nextInventoryOrder(finish, 'name')).toEqual(initial);
		expect(nextInventoryOrder(finish, 'condition')).toEqual({
			base: 'set',
			direction: 'asc',
			variant: { column: 'condition', direction: 'asc' }
		});
	});
	it('retains Recently updated and leaves that mode predictably on an ordinary header click', () => {
		const recent = nextInventoryOrder(nextInventoryOrder(initial, 'finish'), 'recent');
		expect(recent).toEqual({ base: 'recent', direction: 'desc', variant: null });
		const dated = [entry('older'), entry('newer', { updatedAt: new Date('2026-10-06') })];
		expect(orderInventory(dated, recent).map((card) => card.id)).toEqual(['newer', 'older']);
		expect(nextInventoryOrder(recent, 'name')).toEqual(initial);
		expect(nextInventoryOrder(recent, 'set')).toEqual({
			base: 'set',
			direction: 'asc',
			variant: null
		});
		expect(nextInventoryOrder(recent, 'finish')).toEqual({
			...initial,
			variant: { column: 'finish', direction: 'asc' }
		});
	});
	it('uses printing and entry identities to break ties independently of incoming order without mutation', () => {
		const first = Object.freeze(entry('a', { name: 'Same', catalogCardId: 'printing' }));
		const second = Object.freeze(entry('b', { name: 'Same', catalogCardId: 'printing' }));
		const input = Object.freeze([second, first]);
		const result = orderInventory(input, initial);
		expect(result).toEqual([first, second]);
		expect(orderInventory([first, second], initial)).toEqual(result);
		expect(input).toEqual([second, first]);
		expect(result[0]).toBe(first);
	});
	it('describes partition priority and name direction for accessible status', () => {
		expect(describeInventoryOrder(nextInventoryOrder(initial, 'finish'))).toBe(
			'Sorted by finish ascending, then card name ascending, then set ascending.'
		);
		expect(
			describeInventoryOrder(nextInventoryOrder(nextInventoryOrder(initial, 'set'), 'condition'))
		).toBe('Grouped by set ascending, then condition ascending, then card name ascending.');
	});
});

describe('inventory filters', () => {
	it('combines search, set, finish and condition with AND and accepts no matches', () => {
		const filters = { query: ' ALPHA ', set: 'a', finish: 'foil', condition: 'DMG' };
		expect(filterInventory(cards, filters).map((card) => card.id)).toEqual(['a-foil']);
		expect(filterInventory(cards, { ...filters, condition: 'NM' })).toEqual([]);
		expect(filterInventory(cards, all)).toEqual(cards);
	});
	it('preserves search coverage for names, set codes, conditions and notes', () => {
		const noted = [
			entry('one', { name: 'Opt', setCode: 'sta', condition: 'LP', notes: 'Trade binder' })
		];
		for (const query of ['opt', 'STA', 'lp', 'BINDER']) {
			expect(filterInventory(noted, { ...all, query })).toEqual(noted);
		}
	});
	it('does not mutate immutable filter inputs or entries', () => {
		const card = Object.freeze(entry('one'));
		const input = Object.freeze([card]);
		expect(filterInventory(input, all)).toEqual([card]);
		expect(input[0]).toBe(card);
	});
	it('assigns stable case-insensitive existing-token set frame colors', () => {
		expect(inventorySetColor('sta')).toBe(inventorySetColor('STA'));
		expect(inventorySetColor('sta')).toMatch(
			/^var\(--color-(info|violet|success|warning|text-muted)\)$/
		);
	});
});
