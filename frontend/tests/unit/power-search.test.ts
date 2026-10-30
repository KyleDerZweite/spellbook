import { afterEach, expect, it, vi } from 'vitest';
import type { PowerSearchResponse } from '@spellbook/contracts/power-search.ts';
import {
	createPowerSearchReader,
	powerSearchGroups,
	powerSearchNavigation,
	type PowerSearchReadState
} from '../../src/lib/search/power-search.ts';

const response: PowerSearchResponse = {
	query: 'Sol Ring',
	accountId: 'owner',
	generationId: 'generation',
	cards: [{ kind: 'catalog', canonicalCardId: 'sol', catalogCardId: 'printing', name: 'Sol Ring' }],
	inventory: [{ kind: 'inventory', canonicalCardId: 'sol', name: 'Sol Ring', quantity: 4 }],
	decks: [
		{
			kind: 'deck-card',
			deckId: 'elves',
			deckName: 'Elven Expedition',
			canonicalCardId: 'sol',
			name: 'Sol Ring',
			quantity: 1
		},
		{
			kind: 'deck-card',
			deckId: 'dimir',
			deckName: 'Dimir Control',
			canonicalCardId: 'sol',
			name: 'Sol Ring',
			quantity: 2
		}
	]
};
afterEach(() => vi.useRealTimers());

it('retains the same card in Card Search, Inventory and each Deck with distinct destinations', () => {
	const groups = powerSearchGroups(response, 'owner');
	expect(groups.map((group) => group.label)).toEqual(['Card Search', 'Inventory', 'Decks']);
	const rows = groups.flatMap((group) => group.rows);
	expect(new Set(rows.map((row) => row.id)).size).toBe(4);
	expect(rows.map((row) => row.href)).toEqual([
		'/mtg/search?q=Sol+Ring&printing=printing',
		'/mtg/inventory?q=Sol+Ring',
		'/mtg/decks?deck=elves',
		'/mtg/decks?deck=dimir'
	]);
	expect(rows[1].description).toBe('4 owned copies');
	expect(rows[2].description).toContain('Elven Expedition');
});

it('never renders private groups for a guest or a different account response', () => {
	for (const account of [null, 'other'])
		expect(powerSearchGroups(response, account).map((group) => group.id)).toEqual(['catalog']);
});

it('matches reviewed Settings aliases immediately and keeps shortcut discovery read-only', () => {
	expect(powerSearchNavigation('PASSWORT ÄNDERN')[0].rows[0].href).toBe('/settings/password');
	expect(powerSearchNavigation('einstellungen')[0].label).toBe('Settings');
	expect(powerSearchNavigation('tastenkürzel')[0].rows[0].href).toBe('/settings#power-user-search');
	expect(powerSearchNavigation('passwrod')[0].rows[0].href).toBe('/settings/password');
	expect(powerSearchNavigation('settings passwrod')[0].rows[0].href).toBe('/settings/password');
	expect(powerSearchNavigation('decks')[0].rows[0].href).toBe('/mtg/decks');
	expect(powerSearchNavigation('übersicht')[0].rows[0].href).toBe('/mtg/dashboard');
	expect(powerSearchNavigation('zzqxvnl')).toEqual([]);
});

it('debounces typing and rejects a held older response even when the provider ignores cancellation', async () => {
	vi.useFakeTimers();
	let release!: (value: Response) => void;
	const held = new Promise<Response>((resolve) => (release = resolve));
	const read = vi
		.fn<typeof fetch>()
		.mockReturnValueOnce(held)
		.mockResolvedValueOnce(Response.json({ ...response, cards: [], inventory: [], decks: [] }));
	const states: PowerSearchReadState[] = [];
	const reader = createPowerSearchReader({
		read,
		account: () => 'owner',
		changed: (state) => states.push(state)
	});
	reader.search('Sol Ring', 'owner');
	await vi.advanceTimersByTimeAsync(149);
	expect(read).not.toHaveBeenCalled();
	await vi.advanceTimersByTimeAsync(1);
	reader.search('Password', 'owner');
	await vi.advanceTimersByTimeAsync(150);
	release(Response.json(response));
	await vi.advanceTimersByTimeAsync(0);
	expect(states.at(-1)).toEqual({ groups: [], pending: false, error: '' });
	expect(read.mock.calls[0][1]?.signal?.aborted).toBe(true);
	reader.clear();
});

it('fences account replacement and invalidated SavedState authority before a held completion', async () => {
	vi.useFakeTimers();
	for (const reason of ['account', 'publication']) {
		let account: string | null = 'owner',
			current = true;
		let release!: (value: Response) => void;
		const read = vi
			.fn<typeof fetch>()
			.mockReturnValue(new Promise((resolve) => (release = resolve)));
		const states: PowerSearchReadState[] = [];
		const reader = createPowerSearchReader({
			read,
			account: () => account,
			changed: (state) => states.push(state)
		});
		reader.search('Sol Ring', account, () => current);
		await vi.advanceTimersByTimeAsync(150);
		if (reason === 'account') account = null;
		else current = false;
		release(Response.json(response));
		await vi.advanceTimersByTimeAsync(0);
		expect(states.every((state) => state.groups.length === 0)).toBe(true);
		if (reason === 'publication') expect(states.at(-1)?.pending).toBe(false);
		reader.clear();
		expect(states.at(-1)?.pending).toBe(false);
	}
});

it('reports provider failure and clears a pending read on close', async () => {
	vi.useFakeTimers();
	const states: PowerSearchReadState[] = [];
	const read = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
	const reader = createPowerSearchReader({
		read,
		account: () => null,
		changed: (state) => states.push(state)
	});
	reader.search('passwort', null);
	await vi.advanceTimersByTimeAsync(150);
	expect(states.at(-1)?.error).toContain('Page and Settings matches remain usable');
	reader.search('Sol Ring', null);
	reader.clear();
	await vi.advanceTimersByTimeAsync(150);
	expect(read).toHaveBeenCalledTimes(1);
	expect(states.at(-1)).toEqual({ groups: [], pending: false, error: '' });
});
