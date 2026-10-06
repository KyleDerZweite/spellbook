import type { InventoryQuery } from '@spellbook/contracts/inventory.ts';
import { ValidationError } from '../mtg/validation.ts';
const values = {
	finish: ['all', 'foil', 'nonfoil'],
	condition: ['all', 'NM', 'LP', 'MP', 'HP', 'DMG'],
	sort: ['name', 'set', 'newest'],
	dir: ['asc', 'desc'],
	variant: ['finish', 'condition', 'quantity'],
	variantDir: ['asc', 'desc'],
	view: ['cards', 'groups']
};
export function normalizeInventoryQuery(value: unknown): InventoryQuery {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError('Inventory query must be an object');
	const input = value as Record<string, unknown>;
	if (
		Object.keys(input).some(
			(key) =>
				![
					'q',
					'sets',
					'finish',
					'condition',
					'sort',
					'dir',
					'variant',
					'variantDir',
					'view',
					'group',
					'offset',
					'limit'
				].includes(key)
		)
	)
		throw new ValidationError('Unknown Inventory query option');
	const q = input.q ?? '';
	if (typeof q !== 'string' || q.length > 300)
		throw new ValidationError('q must contain at most 300 characters');
	const sets = input.sets ?? [];
	if (
		!Array.isArray(sets) ||
		sets.length > 100 ||
		sets.some((s) => typeof s !== 'string' || !/^[a-z0-9]{1,12}$/i.test(s))
	)
		throw new ValidationError('Invalid sets');
	const defaults = {
		finish: 'all',
		condition: 'all',
		sort: 'name',
		dir: 'asc',
		variant: null,
		variantDir: 'asc',
		view: 'cards'
	};
	const options = { ...defaults };
	for (const [key, allowed] of Object.entries(values)) {
		const selected = input[key] ?? defaults[key as keyof typeof defaults];
		if (selected === null && key === 'variant') continue;
		if (typeof selected !== 'string' || !allowed.includes(selected))
			throw new ValidationError(`Invalid ${key}`);
		Object.assign(options, { [key]: selected });
	}
	const offset = input.offset ?? 0,
		limit = input.limit ?? 50;
	if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0)
		throw new ValidationError('offset must be a nonnegative integer');
	if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100)
		throw new ValidationError('limit must be between 1 and 100');
	const group = input.group ?? null;
	if (
		group !== null &&
		(typeof group !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(group))
	)
		throw new ValidationError('group must be a UUID');
	return {
		...options,
		q: q.trim(),
		sets: [...new Set(sets.map((s) => s.toLowerCase()))].sort(),
		group: group?.toLowerCase() ?? null,
		offset,
		limit
	} as InventoryQuery;
}
export function inventoryQueryFromUrl(url: URL): InventoryQuery {
	const params = url.searchParams;
	const input: Record<string, unknown> = {};
	for (const key of [
		'q',
		'finish',
		'condition',
		'sort',
		'dir',
		'variant',
		'variantDir',
		'view',
		'group'
	])
		if (params.has(key) && !(key === 'variant' && params.get(key) === ''))
			input[key] = params.get(key);
	input.sets = params.getAll('set');
	if (params.has('page')) {
		const page = Number(params.get('page'));
		if (!Number.isSafeInteger(page) || page < 1)
			throw new ValidationError('page must be a positive integer');
		input.offset = (page - 1) * 50;
	}
	if (params.has('offset')) input.offset = Number(params.get('offset'));
	if (params.has('limit')) input.limit = Number(params.get('limit'));
	return normalizeInventoryQuery(input);
}
export function inventoryQueryKey(query: InventoryQuery): string {
	return JSON.stringify({ ...query, offset: 0, limit: 50 });
}
