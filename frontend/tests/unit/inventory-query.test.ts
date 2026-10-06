import { isHttpError } from '@sveltejs/kit';
import { badRequestIfValidation } from '#lib/server/mobile/route-errors.ts';
import { describe, expect, it } from 'vitest';
import {
	normalizeInventoryQuery,
	inventoryQueryFromUrl
} from '@spellbook/backend/inventory/query.ts';

describe('Inventory bounded query', () => {
	it('normalizes native filters and preserves complete composite ordering', () => {
		expect(
			inventoryQueryFromUrl(
				new URL(
					'http://local/mtg/inventory?q=%25_&set=ABC&set=abc&finish=foil&sort=set&dir=desc&variant=quantity&variantDir=asc&page=3'
				)
			)
		).toEqual({
			q: '%_',
			sets: ['abc'],
			finish: 'foil',
			condition: 'all',
			sort: 'set',
			dir: 'desc',
			variant: 'quantity',
			variantDir: 'asc',
			view: 'cards',
			group: null,
			offset: 100,
			limit: 50
		});
	});
	it('rejects invalid addressing and sort rather than accepting arbitrary SQL', () => {
		for (const query of [
			{ limit: 101 },
			{ offset: -1 },
			{ sort: 'notes' },
			{ dir: 'up' },
			{ group: 'other' },
			{ view: 'wrong' }
		])
			expect(() => normalizeInventoryQuery(query)).toThrow();
	});
	it('uses a bounded first page with deterministic identity', () => {
		expect(normalizeInventoryQuery({})).toMatchObject({
			limit: 50,
			offset: 0,
			sort: 'name',
			dir: 'asc',
			variant: null
		});
	});
});

it('returns a controlled Inventory count failure instead of an inexact wire value', () => {
	try {
		badRequestIfValidation({ kind: 'InvalidInventoryCount', message: 'private diagnostic' });
	} catch (cause) {
		if (!isHttpError(cause)) throw cause;
		expect(cause.status).toBe(500);
		expect(cause.body.message).toBe('Inventory totals cannot be represented exactly.');
		return;
	}
	throw Error('Expected controlled failure');
});
