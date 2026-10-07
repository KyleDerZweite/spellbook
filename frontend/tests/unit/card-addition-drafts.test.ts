import { expect, it } from 'vitest';
import {
	nativeAdditionAction,
	cardSignInHref,
	readNativeAdditionDrafts,
	captureAddition,
	retainAddition,
	createDeckAdditionDraft,
	createInventoryAdditionDraft,
	deckAdditionConfirmed,
	deckChoiceOptions,
	selectedDeckChoice
} from '#lib/cards/addition-drafts.ts';
const entered = {
	requestId: '',
	deckId: 'deck',
	catalogCardId: 'printing',
	role: 'main',
	quantity: '2'
};
it('unchanged uncertain retry owns original ID while newer controls get another intent', () => {
	const draft = createDeckAdditionDraft();
	const original = captureAddition(entered, [], null, () => 'A');
	draft.uncertain = retainAddition(draft.uncertain, original);
	const changed = { ...entered, role: 'sideboard' };
	expect(captureAddition(changed, draft.uncertain, null, () => 'B')).toEqual({
		...changed,
		requestId: 'B'
	});
	expect(captureAddition(changed, draft.uncertain, 'A', () => 'C')).toEqual(original);
	expect(captureAddition(entered, draft.uncertain, null, () => 'D')).toEqual(original);
});
it('multiple unresolved requests and caller-owned Inventory drafts survive mode-panel replacement', () => {
	const deck = createDeckAdditionDraft();
	deck.uncertain = retainAddition(deck.uncertain, { ...entered, requestId: 'A' });
	deck.uncertain = retainAddition(deck.uncertain, { ...entered, quantity: '5', requestId: 'B' });
	expect(deck.uncertain.map((intent) => intent.requestId)).toEqual(['A', 'B']);
	const inventory = createInventoryAdditionDraft();
	inventory.condition = 'LP';
	inventory.quantity = 8;
	inventory.uncertain = [
		{
			catalogCardId: 'printing',
			finish: 'foil',
			condition: 'NM',
			quantity: '3',
			requestId: 'original'
		}
	];
	const nextPanel = inventory;
	expect(nextPanel.quantity).toBe(8);
	expect(nextPanel.uncertain[0].quantity).toBe('3');
});
it('only original submitted receipt confirms addition and cannot infer success from a later read', () => {
	const intent = { ...entered, requestId: 'A' };
	const ack = {
		requestId: 'A',
		deckId: 'deck',
		changes: [{ catalogCardId: 'printing', role: 'main', quantity: 9, delta: 2 }]
	};
	expect(deckAdditionConfirmed(ack, intent)).toBe(true);
	for (const receipt of [
		{ ...ack, requestId: 'B' },
		{ ...ack, deckId: 'foreign' },
		{ ...ack, changes: [{ ...ack.changes[0], delta: 7 }] }
	])
		expect(deckAdditionConfirmed(receipt, intent)).toBe(false);
});
it('explicit selected lookup outside page survives paging without defaulting to the first owned Deck', () => {
	const page = {
		items: [{ id: 'first', name: 'First', format: 'Modern' }],
		nextOffset: 20,
		selected: { id: 'deep', name: 'Deep', format: 'Commander' }
	};
	expect(selectedDeckChoice(page, '')).toBe(null);
	expect(selectedDeckChoice(page, 'deep')).toEqual(page.selected);
	expect(deckChoiceOptions(page).map((item) => item.value)).toEqual(['', 'first', 'deep']);
	expect(selectedDeckChoice({ ...page, selected: null }, 'deep')).toBe(null);
});

it('native action preserves canonical Search context and Printing without making a GET mutation', () => {
	const action = nativeAdditionAction(
		'/mtg/search?/addToDeck',
		'/mtg/search?q=Opt&page=3&pageSize=200',
		'printing'
	);
	const url = new URL(action, 'https://spellbook.test');
	expect(url.pathname).toBe('/mtg/search');
	expect(url.searchParams.get('/addToDeck')).toBe('');
	expect(url.searchParams.get('printing')).toBe('printing');
	expect(url.searchParams.get('q')).toBe('Opt');
	expect(url.searchParams.get('page')).toBe('3');
});

it('native choice GET retains exact original draft without accepting success or ownership claims', () => {
	const params = new URLSearchParams({
		deckRetryRequestId: 'original',
		deckRetryCatalogCardId: 'printing',
		deckRetryDeckId: 'owned',
		deckRetryRole: 'sideboard',
		deckRetryQuantity: '7',
		success: 'true',
		accountId: 'foreign'
	});
	expect(readNativeAdditionDrafts(params)).toEqual({
		deckDraft: {
			requestId: 'original',
			catalogCardId: 'printing',
			deckId: 'owned',
			role: 'sideboard',
			quantity: '7'
		},
		inventoryDraft: null
	});
	params.append('deckRetryQuantity', '8');
	expect(() => readNativeAdditionDrafts(params)).toThrow('Invalid retained addition draft');
});
it('retained native Inventory failure fields stay editable even when validation rejected the original quantity', () => {
	const params = new URLSearchParams({
		inventoryRetryRequestId: 'original:inventory',
		inventoryRetryCatalogCardId: 'printing',
		inventoryRetryFinish: 'foil',
		inventoryRetryCondition: 'LP',
		inventoryRetryQuantity: 'bad'
	});
	expect(readNativeAdditionDrafts(params).inventoryDraft).toEqual({
		requestId: 'original:inventory',
		catalogCardId: 'printing',
		finish: 'foil',
		condition: 'LP',
		quantity: 'bad'
	});
	params.set('inventoryRetryQuantity', 'x'.repeat(201));
	expect(() => readNativeAdditionDrafts(params)).toThrow();
});

it('sign-in retains public Printing/query but clears private target and retry URL snapshots', () => {
	const href = cardSignInHref(
		'/mtg/search?q=Opt&deckRetryRequestId=old&deckQuery=Private&selectedDeckId=owned',
		'printing'
	);
	const login = new URL(href, 'https://spellbook.test');
	const destination = new URL(login.searchParams.get('returnTo')!, 'https://spellbook.test');
	expect(destination.pathname).toBe('/mtg/search');
	expect(destination.searchParams.get('printing')).toBe('printing');
	expect(destination.searchParams.get('q')).toBe('Opt');
	expect(destination.searchParams.has('deckRetryRequestId')).toBe(false);
	expect(destination.searchParams.has('selectedDeckId')).toBe(false);
	expect(destination.searchParams.has('deckQuery')).toBe(false);
});
