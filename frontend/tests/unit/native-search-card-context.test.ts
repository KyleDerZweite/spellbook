import { it, expect } from 'vitest';
import { render } from 'svelte/server';
import { readFile } from 'node:fs/promises';
import type { CardDocument } from '@spellbook/contracts/catalog.ts';
import { nativeSearchContext } from '../../src/routes/mtg/search/native.ts';
import NativeCardBrowsingActions from '../../src/lib/components/cards/NativeCardBrowsingActions.svelte';
const id = '12345678-1234-1234-1234-123456789abc';
it('retains valid bounded context and original draft independently of Printing read success', () => {
	const params = new URLSearchParams({
		printing: id,
		deckQuery: '%_\\',
		deckOffset: '1000000',
		selectedDeckId: id,
		deckRetryRequestId: 'original',
		deckRetryCatalogCardId: id,
		deckRetryDeckId: id,
		deckRetryRole: 'main',
		deckRetryQuantity: '1'
	});
	const result = nativeSearchContext(params);
	expect(result.printingId).toBe(id);
	expect(result.choiceQuery).toBe('%_\\');
	expect(result.choiceOffset).toBe(1000000);
	expect(result.deckDraft?.requestId).toBe('original');
	expect(result.context.toString()).toBe(params.toString());
	expect(result.choiceReadError).toBeNull();
});
it('maps repeated, oversized and malformed inputs to controlled errors without forwarding them', () => {
	for (const query of [
		'deckQuery=a&deckQuery=b',
		'deckQuery=' + 'a'.repeat(201),
		'deckOffset=1e3',
		'deckOffset=-1',
		'deckOffset=1000001',
		'selectedDeckId=no'
	]) {
		const result = nativeSearchContext(new URLSearchParams(query));
		expect(result.choiceReadError).not.toBeNull();
		expect(result.context.size).toBe(0);
	}
	const result = nativeSearchContext(
		new URLSearchParams('printing=' + id + '&printing=' + id + '&deckRetryRequestId=partial')
	);
	expect(result.printingReadError).not.toBeNull();
	expect(result.draftReadError).not.toBeNull();
	expect(result.deckDraft).toBeNull();
});
it('renders only an explicit owned selected summary across choice GET and keeps the default empty', async () => {
	const docs: CardDocument[] = JSON.parse(
		await readFile(new URL('../../scripts/demo/cards.json', import.meta.url), 'utf8')
	);
	const common = {
		selectedPrinting: docs[0],
		requestId: 'fresh',
		signedIn: true,
		canonicalSearchHref: '/mtg/search?color=R&color=G',
		choices: {
			items: [{ id: 'first', name: 'First result', format: 'Modern' }],
			nextOffset: 20,
			selected: { id, name: 'Explicit outside page', format: 'Modern' }
		}
	};
	const explicit = (await render(NativeCardBrowsingActions, { props: common })).body;
	expect(explicit).toContain('name="selectedDeckId" value="' + id + '"');
	expect(explicit).toContain('value="' + id + '" selected');
	expect(explicit).not.toContain('Retry original Deck addition');
	const empty = (
		await render(NativeCardBrowsingActions, {
			props: { ...common, choices: { ...common.choices, selected: null } }
		})
	).body;
	expect(empty).not.toContain('name="selectedDeckId"');
	expect(empty).toContain('value="" selected');
});
