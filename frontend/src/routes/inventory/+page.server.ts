import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getInventorySnapshot,
	removeInventoryCard,
	updateInventoryCard
} from '$lib/server/data/inventory';
import { DEFAULT_GAME } from '$lib/state/activeGame.svelte';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login?returnTo=/inventory');
	}

	const { activeGame } = await parent();
	return getInventorySnapshot(locals.user.accountId, activeGame ?? DEFAULT_GAME);
};

export const actions: Actions = {
	updateQuantity: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?returnTo=/inventory');
		}

		const form = await request.formData();
		const entryId = String(form.get('entryId') ?? '');
		const quantity = Number(form.get('quantity') ?? 1);
		const notes = String(form.get('notes') ?? '');

		if (!entryId) {
			return fail(400, { message: 'entryId is required' });
		}

		if (quantity <= 0) {
			await removeInventoryCard(locals.user.accountId, entryId);
			return { success: true };
		}

		await updateInventoryCard(locals.user.accountId, entryId, quantity, notes);
		return { success: true };
	},
	remove: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?returnTo=/inventory');
		}

		const form = await request.formData();
		const entryId = String(form.get('entryId') ?? '');
		if (!entryId) {
			return fail(400, { message: 'entryId is required' });
		}

		await removeInventoryCard(locals.user.accountId, entryId);
		return { success: true };
	}
};
