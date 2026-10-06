import type { InventoryCard } from '#lib/server/data/types.ts';

export type InventoryDirection = 'asc' | 'desc';
export type InventoryVariantColumn = 'finish' | 'condition' | 'quantity';
export type InventoryColumn = 'name' | 'set' | 'recent' | InventoryVariantColumn;
export interface InventoryOrder {
	base: 'name' | 'set' | 'recent';
	direction: InventoryDirection;
	variant: { column: InventoryVariantColumn; direction: InventoryDirection } | null;
}
export interface InventoryFilters {
	query: string;
	set: string;
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
	| 'updatedAt'
>;
const finishes = ['nonfoil', 'foil'];
export const inventoryConditions = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const reverse = (direction: InventoryDirection): InventoryDirection =>
	direction === 'asc' ? 'desc' : 'asc';
const sign = (direction: InventoryDirection) => (direction === 'asc' ? 1 : -1);

export function nextInventoryOrder(order: InventoryOrder, column: InventoryColumn): InventoryOrder {
	if (column === 'recent') return { base: 'recent', direction: 'desc', variant: null };
	if (column === 'name' || column === 'set') {
		return {
			base: column,
			direction: order.base === column ? reverse(order.direction) : 'asc',
			variant: null
		};
	}
	return {
		base: order.base === 'recent' ? 'name' : order.base,
		direction: order.base === 'recent' ? 'asc' : order.direction,
		variant: {
			column,
			direction: order.variant?.column === column ? reverse(order.variant.direction) : 'asc'
		}
	};
}

export function filterInventory<T extends InventoryViewEntry>(
	cards: readonly T[],
	filters: InventoryFilters
): T[] {
	const query = filters.query.trim().toLowerCase();
	return cards.filter(
		(card) =>
			(filters.set === 'all' || card.setCode === filters.set) &&
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
		if (order.base === 'recent') return b.updatedAt.getTime() - a.updatedAt.getTime() || tie;
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

export function describeInventoryOrder(order: InventoryOrder): string {
	if (order.base === 'recent') return 'Sorted by most recently updated.';
	const direction = (value: InventoryDirection) => (value === 'asc' ? 'ascending' : 'descending');
	const variant = order.variant
		? `${order.variant.column} ${direction(order.variant.direction)}, then `
		: '';
	return order.base === 'set'
		? `Grouped by set ${direction(order.direction)}, then ${variant}card name ascending.`
		: `Sorted by ${variant}card name ${direction(order.direction)}, then set ascending.`;
}

export function inventorySetColor(setCode: string): string {
	const palette = ['info', 'violet', 'success', 'warning', 'text-muted'];
	let hash = 0;
	for (const letter of setCode.toLowerCase()) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
	return `var(--color-${palette[hash % palette.length]})`;
}
