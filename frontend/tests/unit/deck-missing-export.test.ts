import { describe, expect, it, vi } from 'vitest';
import {
	buildBulkEbaySearchUrl,
	fetchMissingCardsExport,
	missingExportFilename
} from '../../src/lib/decks/missing-export.ts';

describe('buildBulkEbaySearchUrl', () => {
	it('returns null below both thresholds', () => {
		expect(buildBulkEbaySearchUrl('en', 9, 19)).toBeNull();
		expect(buildBulkEbaySearchUrl('de', 0, 0)).toBeNull();
	});

	it('triggers at >= 10 missing basic lands with locale-dependent eBay domain', () => {
		const de = buildBulkEbaySearchUrl('de', 10, 0);
		expect(de).not.toBeNull();
		expect(de?.domain).toBe('ebay.de');
		expect(de?.reason).toBe('basic_lands');
		expect(de?.url).toContain('https://www.ebay.de/sch/i.html?_nkw=');

		const en = buildBulkEbaySearchUrl('en', 12, 5);
		expect(en).not.toBeNull();
		expect(en?.domain).toBe('ebay.com');
		expect(en?.reason).toBe('basic_lands');
		expect(en?.url).toContain('https://www.ebay.com/sch/i.html?_nkw=');
	});

	it('triggers at >= 20 missing budget cards under 0.50 EUR and handles both', () => {
		const budget = buildBulkEbaySearchUrl('en', 0, 20);
		expect(budget?.domain).toBe('ebay.com');
		expect(budget?.reason).toBe('budget_cards');

		const both = buildBulkEbaySearchUrl('de-DE', 15, 25);
		expect(both?.domain).toBe('ebay.de');
		expect(both?.reason).toBe('both');
	});
});

describe('missingExportFilename', () => {
	it('formats single and multi-deck filenames safely', () => {
		expect(missingExportFilename('cardmarket', ['Atraxa / Superfriends'])).toBe(
			'Atraxa___Superfriends-missing-cardmarket.txt'
		);
		expect(missingExportFilename('tcgplayer', ['Deck A', 'Deck B'])).toBe(
			'2-decks-missing-tcgplayer.txt'
		);
	});
});

describe('fetchMissingCardsExport', () => {
	it('posts expected defaults and returns parsed payload', async () => {
		const payload = {
			deckIds: ['11111111-1111-4111-8111-111111111111'],
			decks: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Test' }],
			mode: 'sum',
			includePrinting: false,
			totalMissingCopies: 2,
			uniqueMissingCards: 1,
			missingBasicLandCopies: 0,
			missingBudgetCardCopies: 0,
			bulkHintEligible: false,
			items: [],
			exports: { cardmarket: '2 Sol Ring\n', tcgplayer: '2 Sol Ring\n', text: '2 Sol Ring\n' }
		};
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify(payload), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		const result = await fetchMissingCardsExport(
			{ deckIds: ['11111111-1111-4111-8111-111111111111'] },
			undefined,
			fetchMock
		);
		expect(result.exports.cardmarket).toBe('2 Sol Ring\n');
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/v1/mtg/decks/missing-export',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					deckIds: ['11111111-1111-4111-8111-111111111111'],
					mode: 'sum',
					includePrinting: false
				})
			})
		);
	});

	it('surfaces API error message on non-2xx response', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ message: 'Deck not found' }), {
					status: 404,
					headers: { 'content-type': 'application/json' }
				})
		);
		await expect(
			fetchMissingCardsExport(
				{ deckIds: ['11111111-1111-4111-8111-111111111111'] },
				undefined,
				fetchMock
			)
		).rejects.toThrow('Deck not found');
	});
});
