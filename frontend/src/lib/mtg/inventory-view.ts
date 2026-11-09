import { translate } from '../i18n/messages.ts';
import type { Locale } from '../i18n/locale.ts';
import type { InventoryCard } from '#lib/types/legacy.ts';

export type InventoryDirection = 'asc' | 'desc';
export type InventoryVariantColumn = 'finish' | 'condition' | 'quantity';
export type InventoryColumn = 'name' | 'set' | 'newest' | InventoryVariantColumn;
export interface InventoryOrder {
	base: 'name' | 'set' | 'newest';
	direction: InventoryDirection;
	variant: { column: InventoryVariantColumn; direction: InventoryDirection } | null;
}
export interface InventoryFilters {
	query: string;
	sets: readonly string[];
	finish: string;
	condition: string;
}
type InventoryViewEntry = Pick<
	InventoryCard,
	| 'id'
	| 'catalogCardId'
	| 'name'
	| 'setCode'
	| 'finish'
	| 'condition'
	| 'quantity'
	| 'notes'
	| 'createdAt'
>;
const finishes = ['nonfoil', 'foil'];
export const inventoryConditions = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const reverse = (direction: InventoryDirection): InventoryDirection =>
	direction === 'asc' ? 'desc' : 'asc';
const sign = (direction: InventoryDirection) => (direction === 'asc' ? 1 : -1);

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

export function filterInventory<T extends InventoryViewEntry>(
	cards: readonly T[],
	filters: InventoryFilters
): T[] {
	const query = filters.query.trim().toLowerCase();
	const sets = new Set(filters.sets.map((code) => code.toLowerCase()));
	return cards.filter(
		(card) =>
			(sets.size === 0 || sets.has(card.setCode.toLowerCase())) &&
			(filters.finish === 'all' || card.finish === filters.finish) &&
			(filters.condition === 'all' || card.condition === filters.condition) &&
			(!query ||
				[card.name, card.setCode, card.condition, card.notes].some((value) =>
					value.toLowerCase().includes(query)
				))
	);
}

export function orderInventory<T extends InventoryViewEntry>(
	cards: readonly T[],
	order: InventoryOrder
): T[] {
	const variantDifference = (a: T, b: T) => {
		if (!order.variant) return 0;
		const { column, direction } = order.variant;
		const difference =
			column === 'quantity'
				? a.quantity - b.quantity
				: column === 'finish'
					? finishes.indexOf(a.finish) - finishes.indexOf(b.finish)
					: inventoryConditions.indexOf(a.condition) - inventoryConditions.indexOf(b.condition);
		return difference * sign(direction);
	};
	return [...cards].sort((a, b) => {
		const tie =
			a.catalogCardId.localeCompare(b.catalogCardId) ||
			finishes.indexOf(a.finish) - finishes.indexOf(b.finish) ||
			inventoryConditions.indexOf(a.condition) - inventoryConditions.indexOf(b.condition) ||
			a.id.localeCompare(b.id);
		if (order.base === 'newest') return b.createdAt.getTime() - a.createdAt.getTime() || tie;
		if (order.base === 'set') {
			return (
				a.setCode.localeCompare(b.setCode) * sign(order.direction) ||
				variantDifference(a, b) ||
				a.name.localeCompare(b.name) ||
				tie
			);
		}
		return (
			variantDifference(a, b) ||
			a.name.localeCompare(b.name) * sign(order.direction) ||
			a.setCode.localeCompare(b.setCode) ||
			tie
		);
	});
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
