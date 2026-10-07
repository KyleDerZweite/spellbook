import { describe, expect, it } from 'vitest';
import {
	hasDeepBrowseAnchor,
	parseLazyBrowsePagination
} from '../../src/lib/browsing/pagination.ts';

describe('full navigation to explicit collection ranges', () => {
	it('keeps a Login returnTo deep Inventory range under Inventory geometry ownership', () => {
		const login = new URL('http://local/auth/login');
		login.searchParams.set('returnTo', '/mtg/inventory?page=40&pageSize=lazy');
		const target = new URL(login.searchParams.get('returnTo')!, login);
		expect(hasDeepBrowseAnchor(target)).toBe(true);
		expect(parseLazyBrowsePagination(target.searchParams, 1_000_000).offset).toBe(7800);
		expect(target.search).toBe('?page=40&pageSize=lazy');
	});
	it('uses the same ownership for full Search and Inventory Groups without dropping context', () => {
		for (const path of ['/mtg/search?q=Opt', '/mtg/inventory?view=groups']) {
			const target = new URL(path + '&page=200&pageSize=lazy&set=m21&set=neo', 'http://local');
			expect(hasDeepBrowseAnchor(target)).toBe(true);
			expect(parseLazyBrowsePagination(target.searchParams, 1_000_000).offset).toBe(39800);
			expect(target.searchParams.getAll('set')).toEqual(['m21', 'neo']);
		}
	});
	it('validates legacy offsets before deciding route ownership', () => {
		expect(hasDeepBrowseAnchor(new URL('http://local/mtg/search?page=6&pageSize=500'))).toBe(true);
		for (const search of [
			'',
			'?page=1&pageSize=lazy',
			'?page=0',
			'?page=2&page=40',
			'?page=5002&pageSize=lazy'
		]) {
			expect(hasDeepBrowseAnchor(new URL('http://local/mtg/inventory' + search))).toBe(false);
		}
	});
	it('leaves normal pathname navigation with Shell, even with unrelated page fields', () => {
		for (const path of ['/auth/login', '/', '/mtg/decks', '/mtg/inventory/unknown']) {
			expect(hasDeepBrowseAnchor(new URL(path + '?page=40&pageSize=lazy', 'http://local'))).toBe(
				false
			);
		}
	});
});
