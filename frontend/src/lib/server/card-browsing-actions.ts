import { fail, redirect, type Action } from '@sveltejs/kit';
import { application } from '#lib/server/composition.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
import { DeckNotFoundError } from '#lib/server/data/decks.ts';
import { readNativeAdditionDrafts, sameAddition } from '#lib/cards/addition-drafts.ts';
import type { DeckAdditionIntent } from '#lib/cards/addition-drafts.ts';

/** Route owner exports this adapter as its named addToDeck action. */
export const addToDeck: Action = async ({ request, locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/search');
	const form = await request.formData();
	const draft: DeckAdditionIntent = {
		requestId: String(form.get('requestId') ?? ''),
		deckId: String(form.get('deckId') ?? ''),
		catalogCardId: String(form.get('catalogCardId') ?? ''),
		role: String(form.get('role') ?? ''),
		quantity: String(form.get('quantity') ?? '')
	};
	const result = { action: 'addToDeck' as const, deckAdditionDraft: draft };
	if (
		Object.entries(draft).some(
			([key, value]) => !value || value.length > 200 || form.getAll(key).length !== 1
		) ||
		!/^\d+$/.test(draft.quantity)
	)
		return fail(400, {
			...result,
			message: 'Choose a Deck, Section and whole positive Quantity.',
			uncertain: false
		});
	if (form.get('originalUncertain') === 'true') {
		try {
			const params = new URLSearchParams();
			for (const [key, value] of form)
				if (key.startsWith('deckRetry') && typeof value === 'string') params.append(key, value);
			const original = readNativeAdditionDrafts(params).deckDraft;
			if (original && sameAddition(original, draft)) draft.requestId = original.requestId;
		} catch {
			return fail(400, {
				...result,
				message: 'Invalid original retry snapshot. Enter a new addition.',
				uncertain: false
			});
		}
	}
	try {
		const acknowledgement = await application.decks.addCatalogCardToDeck(locals.user, {
			...draft,
			quantity: Number(draft.quantity)
		});
		return { ...result, success: true, acknowledgement };
	} catch (cause) {
		if (cause instanceof DeckNotFoundError)
			return fail(404, {
				...result,
				message: 'This Deck is no longer available. Choose an owned Deck.',
				uncertain: false
			});
		if (cause instanceof RequestConflictError)
			return fail(409, { ...result, message: cause.message, uncertain: false });
		if (cause instanceof ValidationError)
			return fail(400, { ...result, message: cause.message, uncertain: false });
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			return fail(401, {
				...result,
				message: 'Your session expired. Sign in again.',
				uncertain: false
			});
		return fail(503, {
			...result,
			message: 'Could not confirm this addition. Retry the original request to confirm it safely.',
			uncertain: true
		});
	}
};

/** Optional native browsing Inventory adapter, wired by the Search route owner. */
export const addBrowsingToInventory: Action = async ({ request, locals }) => {
	if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/search');
	const form = await request.formData();
	const draft = {
		requestId: String(form.get('requestId') ?? ''),
		catalogCardId: String(form.get('catalogCardId') ?? ''),
		finish: String(form.get('finish') ?? ''),
		condition: String(form.get('condition') ?? ''),
		quantity: String(form.get('quantity') ?? '')
	};
	const result = { action: 'addToInventory' as const, inventoryAdditionDraft: draft };
	if (
		Object.entries(draft).some(
			([key, value]) => !value || value.length > 200 || form.getAll(key).length !== 1
		) ||
		!/^\d+$/.test(draft.quantity)
	)
		return fail(400, {
			...result,
			message: 'Choose a Finish, Condition and whole positive Quantity.',
			uncertain: false
		});
	if (form.get('originalUncertain') === 'true') {
		try {
			const params = new URLSearchParams();
			for (const [key, value] of form)
				if (key.startsWith('inventoryRetry') && typeof value === 'string')
					params.append(key, value);
			const original = readNativeAdditionDrafts(params).inventoryDraft;
			if (original && sameAddition(original, draft)) draft.requestId = original.requestId;
		} catch {
			return fail(400, {
				...result,
				message: 'Invalid original retry snapshot. Enter a new addition.',
				uncertain: false
			});
		}
	}
	try {
		const acknowledgement = await application.inventory.add(locals.user, {
			...draft,
			quantity: Number(draft.quantity),
			source: 'web'
		});
		return { ...result, success: true, acknowledgement };
	} catch (cause) {
		if (cause instanceof RequestConflictError)
			return fail(409, { ...result, message: cause.message, uncertain: false });
		if (cause instanceof ValidationError)
			return fail(400, { ...result, message: cause.message, uncertain: false });
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			return fail(401, {
				...result,
				message: 'Your session expired. Sign in again.',
				uncertain: false
			});
		return fail(503, {
			...result,
			message:
				'Could not confirm this Inventory addition. Retry the original request to confirm it safely.',
			uncertain: true
		});
	}
};
