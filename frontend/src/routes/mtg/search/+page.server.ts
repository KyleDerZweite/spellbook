import { fail, redirect, type Actions } from '@sveltejs/kit';
import { addToInventory } from '#lib/server/data/inventory.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
export const actions: Actions = {
	addToInventory: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/search');
		const form = await request.formData();
		try {
			const acknowledgement = await addToInventory(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				catalogCardId: String(form.get('catalogCardId') ?? ''),
				finish: String(form.get('finish') ?? 'nonfoil'),
				condition: String(form.get('condition') ?? 'NM'),
				quantity: Number(form.get('quantity') ?? 1),
				source: 'web'
			});
			return { success: true, acknowledgement };
		} catch (cause) {
			if (cause instanceof RequestConflictError) return fail(409, { message: cause.message });
			if (cause instanceof ValidationError) return fail(400, { message: cause.message });
			throw cause;
		}
	}
};
