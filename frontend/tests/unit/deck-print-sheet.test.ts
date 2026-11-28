import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CardSheetPage from '../../src/routes/mtg/decks/[deckId]/print/cards/+page.svelte';
import { cardsPerPrintPage, printCopies, printPages } from '#lib/decks/print-sheet.ts';

const entry = (
	id: string,
	quantity: number,
	role = 'main',
	imageUri = `https://img/${id}.jpg`
) => ({
	id,
	name: `Card ${id}`,
	imageUri,
	quantity,
	role
});

describe('Deck print sheet', () => {
	it('prints each entry once per required quantity in Deck role order', () => {
		const copies = printCopies([
			entry('side', 2, 'sideboard'),
			entry('bolt', 3),
			entry('boss', 1, 'commander'),
			entry('pet', 1, 'companion'),
			entry('land', 1)
		]);
		expect(copies.map((copy) => copy.key)).toEqual([
			'boss:0',
			'bolt:0',
			'bolt:1',
			'bolt:2',
			'land:0',
			'side:0',
			'side:1',
			'pet:0'
		]);
		expect(copies[1]).toEqual({
			key: 'bolt:0',
			name: 'Card bolt',
			imageUri: 'https://img/bolt.jpg'
		});
	});

	it('prints a back for each selected copy and appends one front per Related Token', () => {
		const card = {
			...entry('dfc', 2),
			backFaceName: 'Back',
			backFaceImageUri: 'https://img/back.jpg'
		};
		const token = {
			catalogCardId: 'soldier',
			name: 'Soldier',
			faces: [{ imageUri: 'https://img/soldier.jpg' }]
		};
		expect(printCopies([card]).map(({ key }) => key)).toEqual(['dfc:0', 'dfc:1']);
		expect(printCopies([card], { backFaces: true, tokens: [token] })).toEqual([
			{ key: 'dfc:0', name: 'Card dfc', imageUri: 'https://img/dfc.jpg' },
			{ key: 'dfc:0:back', name: 'Back', imageUri: 'https://img/back.jpg' },
			{ key: 'dfc:1', name: 'Card dfc', imageUri: 'https://img/dfc.jpg' },
			{ key: 'dfc:1:back', name: 'Back', imageUri: 'https://img/back.jpg' },
			{ key: 'token:soldier', name: 'Soldier', imageUri: 'https://img/soldier.jpg' }
		]);
	});

	it('keeps copies without an image so quantities stay complete', () => {
		const copies = printCopies([entry('blank', 2, 'main', '')]);
		expect(copies).toHaveLength(2);
		expect(copies.every((copy) => copy.imageUri === '' && copy.name === 'Card blank')).toBe(true);
	});

	it('fills nine-card pages and puts only the remainder on the last page', () => {
		const copies = printCopies([entry('a', 4), entry('b', 7), entry('c', 9)]);
		const pages = printPages(copies);
		expect(cardsPerPrintPage).toBe(9);
		expect(copies).toHaveLength(20);
		expect(pages.map((page) => page.length)).toEqual([9, 9, 2]);
		expect(pages.flat()).toEqual(copies);
		expect(pages).toHaveLength(Math.ceil(copies.length / cardsPerPrintPage));
	});

	it('creates no pages for an empty Deck and exactly one for nine cards', () => {
		expect(printPages(printCopies([]))).toEqual([]);
		expect(printPages(printCopies([entry('a', 9)])).map((page) => page.length)).toEqual([9]);
	});

	it('renders every copy in a nine-slot A4 sheet and names cards without an image', () => {
		const { body } = render(CardSheetPage, {
			props: {
				params: { deckId: 'owned' },
				data: {
					deck: { id: 'owned', name: 'Print <Deck>' },
					cards: [entry('bolt', 7), entry('blank', 3, 'sideboard', '')],
					relatedTokens: { status: 'available', items: [], unresolved: [] }
				} as never
			}
		});
		expect(body.match(/class="sheet[ "]/g)).toHaveLength(2);
		expect(body.match(/class="card[ "]/g)).toHaveLength(10);
		expect(body.match(/<img[^>]+alt="Card bolt"/g)).toHaveLength(7);
		expect(body.match(/class="card-name[^"]*">Card blank</g)).toHaveLength(3);
		expect(body).toContain('Page 2 of 2');
		expect(body).toContain('10 cards · 2 A4 pages');
		expect(body).toContain('Loading card images: 0 of 7');
		expect(body).toMatch(/<button[^>]*disabled/);
	});
});
