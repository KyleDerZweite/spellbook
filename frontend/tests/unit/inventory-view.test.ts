import { describe, expect, it } from 'vitest';
import {
	describeInventoryOrder,
	filterInventory,
	inventorySetColor,
	isNewInventoryEntry,
	nextInventoryOrder,
	orderInventory,
	type InventoryFilters,
	type InventoryOrder
} from '../../src/lib/mtg/inventory-view.ts';

const initial: InventoryOrder = { base: 'name', direction: 'asc', variant: null };
const all: InventoryFilters = { query: '', sets: [], finish: 'all', condition: 'all' };
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
		createdAt: Date;
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
		createdAt: new Date('2026-10-01'),
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
	it('accepts an explicit toolbar direction using the same partition rules as headers', () => {
		const sets = nextInventoryOrder(initial, 'set', 'desc');
		expect(nextInventoryOrder(sets, 'finish', 'desc')).toEqual({
			base: 'set',
			direction: 'desc',
			variant: { column: 'finish', direction: 'desc' }
		});
		expect(nextInventoryOrder(sets, 'set', 'desc')).toEqual(sets);
		expect(nextInventoryOrder(sets, 'name', 'asc')).toEqual(initial);
	});
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
	it('uses entry creation date for Newest first and leaves that mode predictably on an ordinary header click', () => {
		const newest = nextInventoryOrder(nextInventoryOrder(initial, 'finish'), 'newest');
		expect(newest).toEqual({ base: 'newest', direction: 'desc', variant: null });
		const dated = [
			entry('older', { updatedAt: new Date('2026-10-07') }),
			entry('newer', { createdAt: new Date('2026-10-06') })
		];
		expect(orderInventory(dated, newest).map((card) => card.id)).toEqual(['newer', 'older']);
		expect(describeInventoryOrder(newest)).toBe('Sorted by entry creation date, newest first.');
		expect(nextInventoryOrder(newest, 'name')).toEqual(initial);
		expect(nextInventoryOrder(newest, 'set')).toEqual({
			base: 'set',
			direction: 'asc',
			variant: null
		});
		expect(nextInventoryOrder(newest, 'finish')).toEqual({
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
		const filters = { query: ' ALPHA ', sets: ['a'], finish: 'foil', condition: 'DMG' };
		expect(filterInventory(cards, filters).map((card) => card.id)).toEqual(['a-foil']);
		expect(filterInventory(cards, { ...filters, condition: 'NM' })).toEqual([]);
		expect(filterInventory(cards, all)).toEqual(cards);
	});
	it('combines selected sets with OR and other filters with AND, ignoring code casing', () => {
		expect(filterInventory(cards, { ...all, sets: ['A', 'b'] })).toEqual(cards);
		expect(
			filterInventory(cards, { ...all, sets: ['A', 'b'], condition: 'MP' }).map((card) => card.id)
		).toEqual(['b-other']);
		expect(filterInventory(cards, { ...all, sets: ['missing'] })).toEqual([]);
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

describe('new inventory entry badges', () => {
	const now = new Date('2026-10-06T12:00:00Z');
	it('marks entries new for exactly seven elapsed days from creation', () => {
		expect(isNewInventoryEntry(now, now)).toBe(true);
		expect(isNewInventoryEntry(new Date('2026-09-29T12:00:00.001Z'), now)).toBe(true);
		expect(isNewInventoryEntry(new Date('2026-09-29T12:00:00Z'), now)).toBe(false);
		expect(isNewInventoryEntry(new Date('2026-09-28T12:00:00Z'), now)).toBe(false);
	});
	it('does not mark future or invalid creation dates new', () => {
		expect(isNewInventoryEntry(new Date('2026-10-06T12:00:01Z'), now)).toBe(false);
		expect(isNewInventoryEntry(new Date('invalid'), now)).toBe(false);
	});
});
