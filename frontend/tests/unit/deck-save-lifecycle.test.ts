import { expect, it } from 'vitest';
import { DeckSaveLifecycle } from '../../src/lib/decks/save-lifecycle.ts';
function held() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}
it('a completed row quantity save leaves newly opened Description editing intact', async () => {
	const lifecycle = new DeckSaveLifecycle('owner', 'deck');
	const submission = lifecycle.capture('updateCard', 'entry');
	const response = held();
	const completion = lifecycle.refresh(submission, () => response.promise);
	lifecycle.open('details');
	const draft = { text: 'New Description while row quantity saves', open: true };
	response.release();
	if ((await completion) && lifecycle.canClose(submission, 'details')) draft.open = false;
	expect(draft).toEqual({ text: 'New Description while row quantity saves', open: true });
});
it('an old Inspector response cannot close a reopened same entry or another entry', async () => {
	const lifecycle = new DeckSaveLifecycle('owner', 'deck');
	lifecycle.open('inspector', 'A');
	const old = lifecycle.capture('removeCard', 'A');
	const response = held();
	const completion = lifecycle.refresh(old, () => response.promise);
	lifecycle.close('inspector');
	lifecycle.open('inspector', 'A');
	response.release();
	expect(await completion).toBe(true);
	expect(lifecycle.canClose(old, 'inspector')).toBe(false);
	const current = lifecycle.capture('changePrinting', 'A');
	lifecycle.open('inspector', 'B');
	expect(lifecycle.canClose(current, 'inspector')).toBe(false);
	expect(lifecycle.canClose(lifecycle.capture('removeCard', 'A'), 'inspector')).toBe(false);
});
it('discarded account, deck and unmounted callbacks cannot refresh or apply UI', async () => {
	const lifecycle = new DeckSaveLifecycle('owner', 'A');
	const old = lifecycle.capture('updateCard', 'entry');
	lifecycle.setScope('owner', 'B', '');
	lifecycle.setScope('owner', 'A', '');
	let refreshed = false;
	expect(
		await lifecycle.refresh(old, async () => {
			refreshed = true;
		})
	).toBe(false);
	expect(refreshed).toBe(false);
	const current = lifecycle.capture('updateCard', 'entry');
	const response = held();
	const completion = lifecycle.refresh(current, () => response.promise);
	lifecycle.setScope('other', 'A', '');
	response.release();
	expect(await completion).toBe(false);
	const unmounted = lifecycle.capture('updateCard', 'entry');
	lifecycle.destroy();
	expect(
		await lifecycle.refresh(unmounted, async () => {
			throw Error('Must not refresh');
		})
	).toBe(false);
});
it('only the committed details acknowledgement advances the same opening baseline', async () => {
	const lifecycle = new DeckSaveLifecycle('owner', 'deck');
	lifecycle.open('details');
	const submitted = lifecycle.capture('updateDeck');
	const response = held();
	const completion = lifecycle.refresh(submitted, () => response.promise);
	const draft = { description: 'B typed during Save A', base: 'Original', revision: '0' };
	const committed = {
		id: 'deck',
		name: 'Name',
		format: 'Modern',
		description: 'A',
		descriptionRevision: '1'
	};
	// A later refetch may show Remote revision2; it is not this save's acknowledgement.
	response.release();
	expect(await completion).toBe(true);
	const base = lifecycle.savedDetails(submitted, committed);
	if (base) {
		draft.base = base.description;
		draft.revision = base.descriptionRevision;
	}
	expect(draft).toEqual({ description: 'B typed during Save A', base: 'A', revision: '1' });
	lifecycle.close('details');
	lifecycle.open('details');
	expect(lifecycle.savedDetails(submitted, committed)).toBeUndefined();
	expect(
		lifecycle.savedDetails(lifecycle.capture('updateCard', 'entry'), committed)
	).toBeUndefined();
	expect(
		lifecycle.savedDetails(lifecycle.capture('updateDeck'), { ...committed, id: 'other' })
	).toBeUndefined();
});

it('owns original Inspector receipt bases without adopting another opening or a replacement destination', () => {
	const lifecycle = new DeckSaveLifecycle('owner', 'deck');
	lifecycle.open('inspector', 'entry');
	const submitted = lifecycle.capture('changePrinting', 'entry');
	const receipt = {
		requestId: 'intent',
		deckId: 'deck',
		revision: '4',
		changes: [{ entryId: 'entry', quantity: 2, role: 'main', catalogCardId: 'printing', delta: 1 }],
		removedEntryIds: []
	};
	expect(lifecycle.savedInspector(submitted, 'intent', receipt)).toEqual({
		quantity: 2,
		role: 'main'
	});
	expect(lifecycle.savedInspector(submitted, 'different', receipt)).toBeUndefined();
	expect(
		lifecycle.savedInspector(submitted, 'intent', {
			...receipt,
			changes: [{ ...receipt.changes[0], entryId: 'destination' }],
			removedEntryIds: ['entry']
		})
	).toBeUndefined();
	lifecycle.close('inspector');
	lifecycle.open('inspector', 'entry');
	expect(lifecycle.savedInspector(submitted, 'intent', receipt)).toBeUndefined();
});
