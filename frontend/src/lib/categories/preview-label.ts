import type { CategoryDifference } from '@spellbook/contracts/category-library.ts';

/** Preview labels belong to each frozen consequence, including entry-only pages. */
export function describeCategoryConsequence(value: CategoryDifference['before']): string {
	if (!value) return 'Unassigned';
	if ('name' in value) return value.name;
	const name =
		value.categoryId === null
			? 'Uncategorized'
			: (value.definitionSnapshot?.name ?? 'Category definition unavailable');
	return `${name} (${value.state})`;
}
