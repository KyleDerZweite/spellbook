import type { CatalogFilters, ColorMatch } from './types.ts';
import { MANA_COLORS, filterOptionLabel } from './filter-options.ts';
import { translate } from '#lib/i18n/messages.ts';
import type { Locale } from '#lib/i18n/locale.ts';

/** Two distinct filters complete WUBRG; Colorless remains an explicit choice. */
export function completeColorMatch(match: ColorMatch): ColorMatch {
	const not = new Set(match.not ?? []);
	const all = new Set(match.all.filter((color) => !not.has(color)));
	const any = new Set(match.any.filter((color) => !not.has(color) && !all.has(color)));
	const active = new Set([...any, ...all, ...not]);
	if (active.size >= 2)
		for (const { id } of MANA_COLORS) if (id !== 'C' && !active.has(id)) not.add(id);
	return {
		field: match.field,
		any: MANA_COLORS.filter(({ id }) => any.has(id)).map(({ id }) => id),
		all: MANA_COLORS.filter(({ id }) => all.has(id)).map(({ id }) => id),
		...(not.size ? { not: MANA_COLORS.filter(({ id }) => not.has(id)).map(({ id }) => id) } : {})
	};
}

/** The request contains exactly the predicate represented by the color controls. */
export function browserColorFilters(match: ColorMatch): CatalogFilters {
	return { colorMatch: completeColorMatch(match) };
}

export function formatColorExpression(
	match: ColorMatch,
	compact = false,
	locale: Locale = 'en'
): { visual: string; spoken: string } {
	const labels = (selected: ColorMatch['all'], abbreviate: boolean) =>
		MANA_COLORS.filter(({ id }) => selected.includes(id)).map((option) =>
			abbreviate ? option.id : filterOptionLabel(option, locale)
		);
	const format = (or: string, and: string, exclude: string, abbreviate = false) => {
		const any = labels(match.any, abbreviate),
			all = labels(match.all, abbreviate),
			not = labels(match.not ?? [], abbreviate);
		const alternative = any.length > 1 ? `(${any.join(or)})` : any[0];
		return [alternative, ...all, ...not.map((label) => `${exclude}${label}`)]
			.filter(Boolean)
			.join(and);
	};
	const empty = translate(
		locale,
		match.field === 'identity' ? 'search.color.anyIdentity' : 'search.color.any'
	);
	return {
		visual: format(' || ', ' && ', '!', compact) || empty,
		spoken: format(' OR ', ' AND ', 'NOT ') || empty
	};
}
