import { createLanguage } from '../../src/lib/i18n/context.ts';
import { describe, expect, it } from 'vitest';
import {
	describeInventoryOrder,
	inventorySetColor,
	isNewInventoryEntry,
	nextInventoryOrder,
	type InventoryOrder
} from '../../src/lib/mtg/inventory-view.ts';

const initial: InventoryOrder = { base: 'name', direction: 'asc', variant: null };
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
		expect(describeInventoryOrder(newest, 'en')).toBe(
			'Sorted by entry creation date, newest first.'
		);
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
	it('describes partition priority and name direction for accessible status', () => {
		expect(describeInventoryOrder(nextInventoryOrder(initial, 'finish'), 'en')).toBe(
			'Sorted by finish ascending, then card name ascending, then set ascending.'
		);
		expect(
			describeInventoryOrder(
				nextInventoryOrder(nextInventoryOrder(initial, 'set'), 'condition'),
				'en'
			)
		).toBe('Grouped by set ascending, then condition ascending, then card name ascending.');
	});
});

describe('inventory filters', () => {
	it('assigns stable case-insensitive existing-token set frame colors', () => {
		expect(inventorySetColor('sta')).toBe(inventorySetColor('STA'));
		expect(inventorySetColor('sta')).toMatch(
			/^var\(--color-(info|violet|success|warning|text-muted)\)$/
		);
	});
});

describe('new inventory entry badges', () => {
	const now = new Date('2026-10-06T12:00:00Z');
	it('marks entries new only on their displayed UTC creation date', () => {
		expect(isNewInventoryEntry(now, now)).toBe(true);
		expect(isNewInventoryEntry(new Date('2026-10-06T00:00:00Z'), now)).toBe(true);
		expect(isNewInventoryEntry(new Date('2026-10-05T23:59:59.999Z'), now)).toBe(false);
		expect(isNewInventoryEntry(new Date('2026-09-29T12:00:00Z'), now)).toBe(false);
	});
	it('expires at the following UTC midnight, even for an entry created a millisecond earlier', () => {
		const created = new Date('2026-10-06T23:59:59.999Z');
		expect(isNewInventoryEntry(created, created)).toBe(true);
		expect(isNewInventoryEntry(created, new Date('2026-10-07T00:00:00Z'))).toBe(false);
	});
	it('compares UTC dates regardless of the timestamp offset', () => {
		expect(
			isNewInventoryEntry(new Date('2026-10-07T01:00:00+02:00'), new Date('2026-10-06T23:30:00Z'))
		).toBe(true);
		expect(
			isNewInventoryEntry(new Date('2026-10-06T23:00:00-02:00'), new Date('2026-10-07T01:30:00Z'))
		).toBe(true);
	});
	it('does not mark future or invalid creation dates new', () => {
		expect(isNewInventoryEntry(new Date('2026-10-06T12:00:01Z'), now)).toBe(false);
		expect(isNewInventoryEntry(new Date('invalid'), now)).toBe(false);
		expect(isNewInventoryEntry(now, new Date('invalid'))).toBe(false);
	});
});

describe('localized Inventory presentation', () => {
	it('switches complete announcements without changing active domain sorting', () => {
		let locale: 'en' | 'de' = 'en';
		const language = createLanguage(() => locale);
		for (const base of ['name', 'set', 'newest'] as const) {
			for (const direction of ['asc', 'desc'] as const) {
				for (const column of [null, 'finish', 'condition', 'quantity'] as const) {
					for (const variantDirection of ['asc', 'desc'] as const) {
						const order: InventoryOrder = {
							base,
							direction,
							variant: column ? { column, direction: variantDirection } : null
						};
						const before = structuredClone(order);
						locale = 'en';
						const english = describeInventoryOrder(order, language.locale);
						locale = 'de';
						const german = describeInventoryOrder(order, language.locale);
						expect(german).not.toMatch(
							/ascending|descending|Sorted|Grouped|finish|condition|quantity/
						);
						expect(german).not.toContain('{');
						if (base !== 'newest')
							expect(german).toContain(direction === 'asc' ? 'aufsteigend' : 'absteigend');
						expect(german).not.toBe(english);
						expect(order).toEqual(before);
						locale = 'en';
						expect(describeInventoryOrder(order, language.locale)).toBe(english);
					}
				}
			}
		}
	});
	it('uses singular, plural and localized numbers and sort directions in both languages', () => {
		for (const locale of ['en', 'de'] as const) {
			const language = createLanguage(() => locale);
			for (const count of [0, 1, 2, 1000]) {
				expect(
					language.t(`entries.${language.plural(count)}`, { count: language.number(count) })
				).toBe(
					`${language.number(count)} ${locale === 'en' ? (count === 1 ? 'entry' : 'entries') : count === 1 ? 'Eintrag' : 'Einträge'}`
				);
			}
			for (const direction of ['asc', 'desc'] as const) {
				const label = language.t('message.Sort.by.p0.p1', {
					p0: language.t('ui.Quantity'),
					p1: language.t(`inventory.direction.${direction}`)
				});
				expect(label).toContain(
					locale === 'en'
						? direction === 'asc'
							? 'ascending'
							: 'descending'
						: direction === 'asc'
							? 'aufsteigend'
							: 'absteigend'
				);
			}
		}
	});
});
