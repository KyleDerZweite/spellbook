import { describe, expect, it, vi } from 'vitest';
import { nativeSearchPageKey, nativeFeedbackRange } from '../../src/lib/search/native-panel.ts';
import { restoreBrowsePosition } from '../../src/lib/browsing/viewport.ts';

import { SearchSession } from '../../src/lib/search/session.svelte.ts';
import { searchPagination } from '../../src/lib/search/navigation.ts';

const url = (path: string) => new URL(path, 'https://spellbook.test');
describe('retained native Search context', () => {
	it('closes on shallow query/filter changes and restores only the original Back context', () => {
		const original = '/mtg/search?q=elf&color=G&color=R&page=2&printing=invalid';
		const key = nativeSearchPageKey(url(original));
		for (const next of [
			'/mtg/search?q=bolt&color=G&color=R&page=1',
			'/mtg/search?q=elf&color=U&page=1'
		])
			expect(nativeSearchPageKey(url(next))).not.toBe(key);
		expect(nativeSearchPageKey(url(original))).toBe(key);
		expect(nativeSearchPageKey(url(original + '&printing=invalid'))).not.toBe(key);
	});
	it('retains named POST acknowledgement context including raw invalid values and original retry', () => {
		const original =
			'/mtg/search?page=999&deckOffset=invalid&deckRetryRequestId=original&deckRetryQuantity=2';
		for (const action of ['addToDeck', 'addToInventory'])
			expect(nativeSearchPageKey(url(original + '&/' + action))).toBe(
				nativeSearchPageKey(url(original))
			);
		expect(nativeSearchPageKey(url(original.replace('Quantity=2', 'Quantity=3')))).not.toBe(
			nativeSearchPageKey(url(original))
		);
		expect(nativeSearchPageKey(url(original.replace('page=999', 'page=1')))).not.toBe(
			nativeSearchPageKey(url(original))
		);
	});
	it('does not confuse no-Printing error/receipt context with a new plain search or another route', () => {
		const context = nativeSearchPageKey(url('/mtg/search?deckQuery=a&deckQuery=b'));
		expect(nativeSearchPageKey(url('/mtg/search'))).not.toBe(context);
		expect(nativeSearchPageKey(url('/mtg/inventory?deckQuery=a&deckQuery=b'))).not.toBe(context);
	});
});
describe('native feedback restoration precedence', () => {
	it('shows native selected/error/receipt feedback instead of numeric or Lazy anchors', () => {
		const host = { scrollTo: vi.fn() };
		const result = { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 0 }) },
			feedback = { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 0 }) };
		for (const top of [0, 10000]) restoreBrowsePosition(host, top, result, feedback);
		expect(feedback.scrollIntoView).toHaveBeenCalledTimes(2);
		expect(host.scrollTo).not.toHaveBeenCalled();
		expect(result.scrollIntoView).not.toHaveBeenCalled();
	});
	it('restores normal numeric heading and saved numeric/Lazy/modal positions after context closes', () => {
		const host = { scrollTo: vi.fn() },
			result = { scrollIntoView: vi.fn(), getBoundingClientRect: () => ({ top: 0 }) };
		restoreBrowsePosition(host, 0, result, null);
		restoreBrowsePosition(host, 12345, result, null);
		expect(result.scrollIntoView).toHaveBeenCalledOnce();
		expect(host.scrollTo).toHaveBeenCalledWith({ top: 12345, behavior: 'instant' });
	});
});

it('keeps a deep native Lazy URL during panel restoration, then resumes measured anchor changes', () => {
	const session = new SearchSession();
	session.hydrate({ query: 'elf', filters: {}, pagination: searchPagination('lazy', 5) });
	const replace = vi.fn();
	session.onEdit = replace;
	const visible = { start: 0, end: 14, anchor: 0, direction: 1 as const };
	session.setRange(nativeFeedbackRange(visible, session.pagination.offset, true));
	expect(session.pagination.page).toBe(5);
	expect(session.range.start).toBe(0);
	expect(replace).not.toHaveBeenCalled();
	session.setRange(nativeFeedbackRange(visible, session.pagination.offset, false));
	expect(session.pagination.page).toBe(1);
	expect(replace).toHaveBeenCalledWith('replace');
});
