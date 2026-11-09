import { translate } from '../i18n/messages.ts';
import type { Locale } from '../i18n/locale.ts';

export type InventoryDirection = 'asc' | 'desc';
export type InventoryVariantColumn = 'finish' | 'condition' | 'quantity';
export type InventoryColumn = 'name' | 'set' | 'newest' | InventoryVariantColumn;
export interface InventoryOrder {
	base: 'name' | 'set' | 'newest';
	direction: InventoryDirection;
	variant: { column: InventoryVariantColumn; direction: InventoryDirection } | null;
}
export const inventoryConditions = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const reverse = (direction: InventoryDirection): InventoryDirection =>
	direction === 'asc' ? 'desc' : 'asc';

export function nextInventoryOrder(
	order: InventoryOrder,
	column: InventoryColumn,
	direction?: InventoryDirection
): InventoryOrder {
	if (column === 'newest') return { base: 'newest', direction: 'desc', variant: null };
	if (column === 'name' || column === 'set') {
		return {
			base: column,
			direction: direction ?? (order.base === column ? reverse(order.direction) : 'asc'),
			variant: null
		};
	}
	return {
		base: order.base === 'newest' ? 'name' : order.base,
		direction: order.base === 'newest' ? 'asc' : order.direction,
		variant: {
			column,
			direction:
				direction ?? (order.variant?.column === column ? reverse(order.variant.direction) : 'asc')
		}
	};
}

export function describeInventoryOrder(order: InventoryOrder, locale: Locale): string {
	if (order.base === 'newest') return translate(locale, 'inventory.order.newest');
	const direction = translate(locale, `inventory.direction.${order.direction}`);
	if (!order.variant) return translate(locale, `inventory.order.${order.base}`, { direction });
	return translate(locale, `inventory.order.${order.base}.variant`, {
		direction,
		column: translate(locale, `inventory.column.${order.variant.column}`),
		variantDirection: translate(locale, `inventory.direction.${order.variant.direction}`)
	});
}

export function isNewInventoryEntry(createdAt: Date, asOf: Date): boolean {
	const created = createdAt.getTime();
	const current = asOf.getTime();
	const utcDay = 24 * 60 * 60 * 1000;
	return created <= current && Math.floor(created / utcDay) === Math.floor(current / utcDay);
}

export function inventorySetColor(setCode: string): string {
	const palette = ['info', 'violet', 'success', 'warning', 'text-muted'];
	let hash = 0;
	for (const letter of setCode.toLowerCase()) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
	return `var(--color-${palette[hash % palette.length]})`;
}
