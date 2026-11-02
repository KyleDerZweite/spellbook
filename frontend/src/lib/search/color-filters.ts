import type { CatalogFilters, ColorMatch } from './types.ts';

/** Browser AND-only selections require exactly their selected palette. */
export function browserColorFilters(match: ColorMatch): CatalogFilters {
	const colorMatch = {
		field: match.field,
		any: [...match.any],
		all: [...match.all],
		...(match.not === undefined ? {} : { not: [...match.not] })
	};
	if (match.any.length || !match.all.length) return { colorMatch };
	return match.field === 'identity'
		? { colorMatch, colorIdentity: [...match.all] }
		: { colorMatch, colors: [...match.all] };
}
