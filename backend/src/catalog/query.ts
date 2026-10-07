import type { CatalogFilters } from '@spellbook/contracts/catalog.ts';
import { ValidationError } from '../mtg/validation.ts';

export type { CatalogSearchInput } from '@spellbook/contracts/catalog.ts';
import type { CatalogSearchInput } from '@spellbook/contracts/catalog.ts';

const allowedValues = {
	colors: ['W', 'U', 'B', 'R', 'G', 'C'],
	colorIdentity: ['W', 'U', 'B', 'R', 'G', 'C'],
	rarities: ['common', 'uncommon', 'rare', 'mythic'],
	types: [
		'Creature',
		'Instant',
		'Sorcery',
		'Enchantment',
		'Artifact',
		'Planeswalker',
		'Land',
		'Battle',
		'Kindred'
	],
	legalities: ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper', 'brawl']
};

export function parseCatalogSearchRequest(value: unknown): CatalogSearchInput {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError('Search request must be an object');
	const body = value as Record<string, unknown>;
	if (
		Object.keys(body).some(
			(key) => !['query', 'filters', 'limit', 'offset', 'sort', 'facets'].includes(key)
		)
	)
		throw new ValidationError('Unknown search option');
	const query = body.query === undefined ? '' : body.query;
	if (typeof query !== 'string' || query.length > 300)
		throw new ValidationError('query must be a string of at most 300 characters');
	const filters: CatalogFilters = {};
	if (body.filters !== undefined) {
		if (!body.filters || typeof body.filters !== 'object' || Array.isArray(body.filters))
			throw new ValidationError('filters must be an object');
		for (const [key, values] of Object.entries(body.filters)) {
			if (!Object.hasOwn(allowedValues, key) && key !== 'sets')
				throw new ValidationError(`Unknown filter: ${key}`);
			if (
				!Array.isArray(values) ||
				values.length > 100 ||
				values.some((item) => typeof item !== 'string')
			)
				throw new ValidationError(`${key} must be an array of at most 100 strings`);
			const normalized = key === 'sets' ? values.map((item) => item.toLowerCase()) : values;
			if (
				normalized.some((item) =>
					key === 'sets'
						? !/^[a-z0-9]{1,12}$/.test(item)
						: !allowedValues[key as keyof typeof allowedValues].includes(item)
				)
			)
				throw new ValidationError(`Invalid ${key} filter`);
			Object.assign(filters, { [key]: [...new Set(normalized)] });
		}
	}
	const limit = body.limit === undefined ? 20 : body.limit;
	const offset = body.offset === undefined ? 0 : body.offset;
	if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 0 || limit > 500)
		throw new ValidationError('limit must be an integer between 0 and 500');
	if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0 || offset > 1000000)
		throw new ValidationError('offset must be an integer between 0 and 1000000');
	if (body.sort !== undefined && body.sort !== 'name:asc' && body.sort !== 'name:desc')
		throw new ValidationError('Invalid search sort');
	if (body.facets !== undefined && typeof body.facets !== 'boolean')
		throw new ValidationError('facets must be a boolean');
	return {
		query: query.trim(),
		filters,
		limit,
		offset,
		sort: body.sort,
		facets: body.facets ?? false
	};
}
