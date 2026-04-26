import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	addDeckCard,
	createDeck,
	deleteDeck,
	getDeckSnapshot,
	removeDeckCard,
	updateDeck,
	updateDeckCard
} from '$lib/server/data/decks';
import { DEFAULT_GAME } from '$lib/state/activeGame.svelte';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login?returnTo=/decks');
	}

	const { activeGame } = await parent();
	return getDeckSnapshot(locals.user.accountId, activeGame ?? DEFAULT_GAME);
};

export const actions: Actions = {
	createDeck: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (!name.trim()) return fail(400, { message: 'name is required' });
		await createDeck(locals.user.accountId, {
			game: String(form.get('game') ?? DEFAULT_GAME),
			name,
			description: String(form.get('description') ?? ''),
			format: String(form.get('format') ?? 'Commander')
		});
		return { success: true };
	},
	updateDeck: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		const form = await request.formData();
		const deckId = String(form.get('deckId') ?? '');
		if (!deckId) return fail(400, { message: 'deckId is required' });
		await updateDeck(locals.user.accountId, {
			deckId,
			name: String(form.get('name') ?? ''),
			description: String(form.get('description') ?? ''),
			format: String(form.get('format') ?? 'Commander')
		});
		return { success: true };
	},
	deleteDeck: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		const form = await request.formData();
		const deckId = String(form.get('deckId') ?? '');
		if (!deckId) return fail(400, { message: 'deckId is required' });
		await deleteDeck(locals.user.accountId, deckId);
		return { success: true };
	},
	addCard: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		const form = await request.formData();
		const deckId = String(form.get('deckId') ?? '');
		if (!deckId) return fail(400, { message: 'deckId is required' });
		await addDeckCard(locals.user.accountId, {
			deckId,
			catalogCardId: String(form.get('catalogCardId') ?? ''),
			canonicalCardId: String(form.get('canonicalCardId') ?? ''),
			name: String(form.get('name') ?? ''),
			setCode: String(form.get('setCode') ?? ''),
			imageUri: String(form.get('imageUri') ?? ''),
			quantity: Number(form.get('quantity') ?? 1),
			role: String(form.get('role') ?? 'main')
		});
		return { success: true };
	},
	updateCard: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/decks');
		const form = await request.formData();
		const entryId = String(form.get('entryId') ?? '');
		const quantity = Number(form.get('quantity') ?? 1);
		if (!entryId) return fail(400, { message: 'entryId is required' });
		if (quantity <= 0) {
			await removeDeckCard(locals.user.accountId, entryId);
		} else {
			await updateDeckCard(locals.user.accountId, entryId, quantity);
		}
		return { success: true };
	}
};
