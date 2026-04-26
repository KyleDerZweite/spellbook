import { fail, redirect, type Actions } from '@sveltejs/kit';
import { addToInventory } from '$lib/server/data/inventory';
import { DEFAULT_GAME } from '$lib/state/activeGame.svelte';

export const actions: Actions = {
	addToInventory: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?returnTo=/search');
		}

		const form = await request.formData();
		const catalogCardId = String(form.get('catalogCardId') ?? '');
		const canonicalCardId = String(form.get('canonicalCardId') ?? '');
		const name = String(form.get('name') ?? '');

		if (!catalogCardId || !canonicalCardId || !name) {
			return fail(400, { message: 'Card identity is required' });
		}

		await addToInventory(locals.user.accountId, {
			game: String(form.get('game') ?? DEFAULT_GAME),
			catalogCardId,
			canonicalCardId,
			name,
			setCode: String(form.get('setCode') ?? ''),
			imageUri: String(form.get('imageUri') ?? ''),
			finish: String(form.get('finish') ?? 'nonfoil'),
			condition: String(form.get('condition') ?? 'NM'),
			quantity: Number(form.get('quantity') ?? 1)
		});

		return { success: true, addedName: name };
	}
};
