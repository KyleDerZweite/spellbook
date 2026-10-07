import type { DeckAcknowledgement } from '@spellbook/contracts/decks.ts';
export interface DeckAdditionIntent {
	deckName?: string;
	printingName?: string;
	requestId: string;
	deckId: string;
	catalogCardId: string;
	role: string;
	quantity: string;
}
export interface InventoryAdditionIntent {
	printingName?: string;
	requestId: string;
	catalogCardId: string;
	finish: string;
	condition: string;
	quantity: string;
}
/** Caller retains this object across action-panel transitions within one opening. */
export function createDeckAdditionDraft() {
	return {
		accountId: null as string | null,
		deckId: '',
		role: 'main',
		quantity: 1,
		requestId: '',
		uncertain: [] as DeckAdditionIntent[],
		acknowledgement: null as DeckAcknowledgement | null,
		message: '',
		error: ''
	};
}
export type DeckAdditionDraft = ReturnType<typeof createDeckAdditionDraft>;
export function createInventoryAdditionDraft() {
	return {
		accountId: null as string | null,
		finish: 'nonfoil',
		condition: 'NM',
		quantity: 1,
		requestId: '',
		uncertain: [] as InventoryAdditionIntent[],
		message: '',
		error: ''
	};
}
export type InventoryAdditionDraft = ReturnType<typeof createInventoryAdditionDraft>;
export function sameAddition(a: DeckAdditionIntent | InventoryAdditionIntent, b: typeof a) {
	const keys =
		'deckId' in a
			? (['deckId', 'catalogCardId', 'role', 'quantity'] as const)
			: (['catalogCardId', 'finish', 'condition', 'quantity'] as const);
	return keys.every((key) => key in a && key in b && Reflect.get(a, key) === Reflect.get(b, key));
}
export function deckAdditionConfirmed(
	value: unknown,
	intent: DeckAdditionIntent
): value is DeckAcknowledgement {
	if (
		!value ||
		typeof value !== 'object' ||
		!('requestId' in value) ||
		value.requestId !== intent.requestId ||
		!('deckId' in value) ||
		value.deckId !== intent.deckId ||
		!('changes' in value) ||
		!Array.isArray(value.changes)
	)
		return false;
	return value.changes.some(
		(change: unknown) =>
			!!change &&
			typeof change === 'object' &&
			'catalogCardId' in change &&
			change.catalogCardId === intent.catalogCardId &&
			'role' in change &&
			change.role === intent.role &&
			'delta' in change &&
			change.delta === Number(intent.quantity)
	);
}
export const DECK_ROLES = [
	{ value: 'main', label: 'Main' },
	{ value: 'sideboard', label: 'Sideboard' },
	{ value: 'commander', label: 'Commander' },
	{ value: 'companion', label: 'Companion' }
];
export function deckChoiceOptions(
	page: import('@spellbook/contracts/decks.ts').DeckChoicePage | null
) {
	const items = page?.items ?? [];
	const selected = page?.selected;
	return [
		{ value: '', label: 'Choose an owned Deck' },
		...items.map((item) => ({ value: item.id, label: item.name })),
		...(selected && !items.some((item) => item.id === selected.id)
			? [{ value: selected.id, label: selected.name }]
			: [])
	];
}
export function selectedDeckChoice(
	page: import('@spellbook/contracts/decks.ts').DeckChoicePage | null,
	id: string
) {
	return page?.selected?.id === id
		? page.selected
		: (page?.items.find((item) => item.id === id) ?? null);
}

export function captureAddition<T extends DeckAdditionIntent | InventoryAdditionIntent>(
	entered: T,
	uncertain: T[],
	retryId: string | null,
	newId: () => string
): T {
	const original = retryId
		? uncertain.find((item) => item.requestId === retryId)
		: uncertain.find((item) => sameAddition(item, entered));
	return original ? { ...original } : { ...entered, requestId: newId() };
}
export function retainAddition<T extends DeckAdditionIntent | InventoryAdditionIntent>(
	uncertain: T[],
	intent: T
): T[] {
	return [...uncertain.filter((item) => item.requestId !== intent.requestId), { ...intent }];
}
/** Native POST reloads retain the public Printing and canonical GET context. */
export function nativeAdditionAction(
	action: string,
	canonicalSearchHref: string,
	printingId: string
) {
	const target = new URL(action, 'https://spellbook.invalid');
	const context = new URL(canonicalSearchHref, 'https://spellbook.invalid');
	const copiedKeys = new Set<string>();
	for (const [key, value] of context.searchParams)
		if (
			!key.startsWith('/') &&
			!key.startsWith('deckRetry') &&
			!key.startsWith('inventoryRetry') &&
			key !== 'printing'
		) {
			if (!copiedKeys.has(key)) {
				target.searchParams.delete(key);
				copiedKeys.add(key);
			}
			target.searchParams.append(key, value);
		}
	target.searchParams.set('printing', printingId);
	return target.pathname + target.search;
}
/** URL values retain drafts only. They never establish ownership or confirmation. */
export function readNativeAdditionDrafts(params: URLSearchParams): {
	deckDraft: DeckAdditionIntent | null;
	inventoryDraft: InventoryAdditionIntent | null;
} {
	const read = (prefix: string, keys: readonly string[]) => {
		const names = keys.map((key) => prefix + key[0].toUpperCase() + key.slice(1));
		const present = [...params.keys()].filter((key) => key.startsWith(prefix));
		if (!present.length) return null;
		if (
			present.some((name) => !names.includes(name)) ||
			names.some(
				(name) =>
					params.getAll(name).length !== 1 ||
					!params.get(name) ||
					params.get(name)!.length > 200 ||
					/[\u0000-\u001f]/.test(params.get(name)!)
			)
		)
			throw Error(
				'Invalid retained addition draft. Return to the Printing and enter a new addition.'
			);
		return keys.map((key, index) => [key, params.get(names[index])!]);
	};
	const deck = read('deckRetry', ['requestId', 'catalogCardId', 'deckId', 'role', 'quantity']);
	const inventory = read('inventoryRetry', [
		'requestId',
		'catalogCardId',
		'finish',
		'condition',
		'quantity'
	]);
	return {
		deckDraft: deck
			? {
					requestId: deck[0][1],
					catalogCardId: deck[1][1],
					deckId: deck[2][1],
					role: deck[3][1],
					quantity: deck[4][1]
				}
			: null,
		inventoryDraft: inventory
			? {
					requestId: inventory[0][1],
					catalogCardId: inventory[1][1],
					finish: inventory[2][1],
					condition: inventory[3][1],
					quantity: inventory[4][1]
				}
			: null
	};
}

export function cardSignInHref(canonicalSearchHref: string, printingId?: string) {
	const context = new URL(
		nativeAdditionAction('/mtg/search', canonicalSearchHref, printingId ?? ''),
		'https://spellbook.invalid'
	);
	for (const key of ['selectedDeckId', 'deckQuery', 'deckOffset']) context.searchParams.delete(key);
	if (!printingId) context.searchParams.delete('printing');
	return '/auth/login?returnTo=' + encodeURIComponent(context.pathname + context.search);
}
