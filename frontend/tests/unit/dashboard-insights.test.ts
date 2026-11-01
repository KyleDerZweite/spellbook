import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { DashboardSummary } from '@spellbook/contracts/dashboard.ts';
import DashboardInsights from '#lib/components/dashboard/DashboardInsights.svelte';

function summary(): DashboardSummary {
	return {
		totals: { total: 5, names: 2, printings: 2, sets: 2, foils: 0, decks: 0 },
		catalogBreakdown: {
			colors: [],
			colorIdentity: [
				{ label: 'Red', quantity: 3, share: 0.6 },
				{ label: 'Unknown', quantity: 2, share: 0.4 }
			],
			primaryTypes: [
				{ label: 'Creature', quantity: 3, share: 0.6 },
				{ label: 'Unknown', quantity: 2, share: 0.4 },
				{ label: 'Land', quantity: 0, share: 0 }
			],
			rarities: [],
			matchedQuantity: 3,
			unknownQuantity: 2,
			setNames: { tst: 'Test expansion' }
		},
		requirements: { missing: [], alternate: [] },
		sets: [
			{ label: 'tst', quantity: 3, share: 0.6 },
			{ label: 'oth', quantity: 2, share: 0.4 }
		],
		finishes: [],
		conditions: [],
		recentEntries: [
			{
				id: 'owned-entry',
				catalogCardId: 'printing',
				canonicalCardId: 'canonical',
				name: 'Card alpha',
				setCode: 'tst',
				imageUri: '',
				quantity: 3,
				finish: 'nonfoil',
				condition: 'NM',
				updatedAt: '2026-10-31T12:00:00Z'
			}
		],
		decks: [],
		pendingScanReviews: null,
		inventoryValue: null,
		inventoryValueHistory: null,
		valuationError: null
	};
}

describe('Dashboard reference insights', () => {
	it('keeps unmatched copies, zero types and genuine edit identity in the rendered data', async () => {
		const { body } = await render(DashboardInsights, { props: { dashboard: summary() } });
		expect(body).toContain('Unknown: 2 copies, 40%');
		expect(body).toContain('0 copies · 0%');
		expect(body).toContain('Test expansion: 3 copies');
		expect(body).toContain('/mtg/inventory/owned-entry');
		expect(body).toContain('datetime="2026-10-31T12:00:00Z"');
		expect(body).not.toMatch(/Added \d|Scanned deck|Imported from|NaN|Infinity/);
	});
	it('keeps Inventory summaries usable when the optional Catalog breakdown is unavailable', async () => {
		const dashboard = summary();
		dashboard.catalogBreakdown = null;
		const { body } = await render(DashboardInsights, { props: { dashboard } });
		expect(body.match(/Catalog breakdown unavailable/g)).toHaveLength(2);
		expect(body).toContain('TST: 3 copies');
		expect(body).toContain('Card alpha');
		expect(body).not.toContain('Physical copies by exclusive primary card type');
	});
});
