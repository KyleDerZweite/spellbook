import { parseSortPredicates, type SortField } from '@spellbook/contracts/cardstation-sort-rule.ts';
import type { PhysicalBox } from '@spellbook/contracts/physical-boxes.ts';

export function physicalBoxCondition(form: FormData): PhysicalBox['condition'] {
	const fields: [SortField, string[]][] = [
		['printedColor', form.getAll('printedColor').map(String)],
		['rarity', form.getAll('rarity').map(String)],
		[
			'setCode',
			String(form.get('setCode') ?? '')
				.split(',')
				.map((code) => code.trim())
				.filter(Boolean)
		]
	];
	const predicates = fields
		.filter(([, values]) => values.length)
		.map(([field, oneOf]) => ({ field, oneOf }));
	return form.has('clear') || !predicates.length ? null : parseSortPredicates(predicates);
}
