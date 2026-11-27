import { describe, expect, it } from 'vitest';
import {
	DISCOVERY_PAGE_SIZE,
	discoveryHref,
	discoveryQueryFromState,
	discoveryStateFromParams,
	hasActiveDiscoveryFilters,
	safeHttpUrl
} from '../../src/lib/decks/discovery-query.ts';

describe('SuperBrew deck discovery URL state', () => {
	it('parses defaults when params are empty or invalid', () => {
		const state = discoveryStateFromParams(
			new URLSearchParams({
				discFormat: 'not-a-format',
				discBudget: '-10',
				discMinOwned: '250',
				discMode: 'other',
				discSort: 'unknown',
				discPage: '0'
			})
		);

		expect(state).toEqual({
			format: '',
			source: '',
			query: '',
			maxMissingCost: null,
			minOwnership: null,
			inventoryMode: 'all',
			sort: 'missing_cost:asc',
			page: 1
		});
		expect(hasActiveDiscoveryFilters(state)).toBe(false);
	});

	it('parses valid budget, ownership, inventoryMode, sort, and pagination params', () => {
		const state = discoveryStateFromParams(
			new URLSearchParams({
				tab: 'discovery',
				discFormat: 'Modern',
				discSource: 'mtggoldfish',
				discQ: '  Boros Energy  ',
				discBudget: '25,50',
				discMinOwned: '75',
				discMode: 'free',
				discSort: 'ownership:desc',
				discPage: '3'
			})
		);

		expect(state).toEqual({
			format: 'modern',
			source: 'mtggoldfish',
			query: 'Boros Energy',
			maxMissingCost: 25.5,
			minOwnership: 75,
			inventoryMode: 'free',
			sort: 'ownership:desc',
			page: 3
		});
		expect(hasActiveDiscoveryFilters(state)).toBe(true);

		expect(discoveryQueryFromState(state)).toEqual({
			format: 'modern',
			source: 'mtggoldfish',
			query: 'Boros Energy',
			maxMissingCost: 25.5,
			minOwnership: 75,
			inventoryMode: 'free',
			sort: 'ownership:desc',
			limit: DISCOVERY_PAGE_SIZE,
			offset: 2 * DISCOVERY_PAGE_SIZE
		});
	});

	it('serializes minimal canonical discovery URLs', () => {
		expect(discoveryHref({})).toBe('/mtg/decks?tab=discovery');
		expect(
			discoveryHref({
				format: 'pauper',
				maxMissingCost: 15,
				minOwnership: 50,
				inventoryMode: 'free',
				sort: 'meta_share:desc',
				page: 2
			})
		).toBe(
			'/mtg/decks?tab=discovery&discFormat=pauper&discBudget=15&discMinOwned=50&discMode=free&discSort=meta_share%3Adesc&discPage=2'
		);
	});

	it('allows only absolute http/https URLs for external reference deck sources', () => {
		expect(safeHttpUrl('https://www.mtggoldfish.com/archetype/modern-boros-energy')).toBe(
			'https://www.mtggoldfish.com/archetype/modern-boros-energy'
		);
		expect(safeHttpUrl('http://example.test/deck')).toBe('http://example.test/deck');
		expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
		expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(safeHttpUrl('/relative/path')).toBeNull();
		expect(safeHttpUrl(null)).toBeNull();
	});
});
