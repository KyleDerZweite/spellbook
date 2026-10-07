import { readNativeAdditionDrafts } from '#lib/cards/addition-drafts.ts';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** GET context retains intent only; backend reads and commands establish authority. */
export function nativeSearchContext(params: URLSearchParams) {
	const context = new URLSearchParams();
	let printingId: string | null = null;
	let printingReadError: string | null = null;
	if (params.has('printing')) {
		const selections = params.getAll('printing');
		if (selections.length === 1 && uuid.test(selections[0])) {
			printingId = selections[0].toLowerCase();
			context.set('printing', printingId);
		} else printingReadError = 'Invalid printing selection. Choose a card from the results.';
	}
	let choiceQuery = '',
		choiceOffset = 0,
		selectedDeckId: string | undefined;
	let choiceReadError: string | null = null;
	for (const key of ['deckQuery', 'deckOffset', 'selectedDeckId']) {
		if (!params.has(key)) continue;
		const values = params.getAll(key),
			value = values[0];
		if (
			values.length !== 1 ||
			(key === 'deckQuery' && (value.length > 200 || /[\u0000-\u001f]/.test(value))) ||
			(key === 'deckOffset' &&
				(!/^\d+$/.test(value) ||
					!Number.isSafeInteger(Number(value)) ||
					Number(value) > 1_000_000)) ||
			(key === 'selectedDeckId' && !uuid.test(value))
		) {
			choiceReadError = 'Invalid Deck choices. Enter a new Deck search or selection.';
			continue;
		}
		if (key === 'deckQuery') choiceQuery = value;
		if (key === 'deckOffset') choiceOffset = Number(value);
		if (key === 'selectedDeckId') selectedDeckId = value.toLowerCase();
		context.set(key, key === 'selectedDeckId' ? value.toLowerCase() : value);
	}
	let drafts: ReturnType<typeof readNativeAdditionDrafts> = {
		deckDraft: null,
		inventoryDraft: null
	};
	let draftReadError: string | null = null;
	try {
		drafts = readNativeAdditionDrafts(params);
		for (const [key, value] of params)
			if (key.startsWith('deckRetry') || key.startsWith('inventoryRetry'))
				context.append(key, value);
	} catch {
		draftReadError = 'Invalid retained addition draft. Enter a new addition from the Printing.';
	}
	return {
		printingId,
		printingReadError,
		choiceQuery,
		choiceOffset,
		selectedDeckId,
		choiceReadError,
		draftReadError,
		...drafts,
		context
	};
}
