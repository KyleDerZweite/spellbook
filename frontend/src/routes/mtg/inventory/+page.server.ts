import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	InventoryQuantityChangedError,
	removeInventoryCard,
	updateInventoryCard
} from '#lib/server/data/inventory.ts';
import {
	createInventoryGroup,
	deleteInventoryGroup,
	InventoryGroupNotFoundError,
	renameInventoryGroup,
	replaceInventoryGroupMemberships
} from '#lib/server/data/inventory-groups.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { DEFAULT_GAME } from '#lib/state/activeGame.svelte.ts';
import { inventoryApplication, inventoryQueryFromUrl } from '#lib/server/data/inventory-window.ts';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
	}

	const { activeGame } = await parent();
	const game = activeGame ?? DEFAULT_GAME;
	try {
		const window = await inventoryApplication.page(locals.user, inventoryQueryFromUrl(url));
		if (window.kind !== 'Page') throw new Error('Initial window must be current');
		return {
			window,
			cards: window.entries.map((entry) => ({
				...entry,
				createdAt: new Date(entry.createdAt),
				updatedAt: new Date(entry.updatedAt)
			})),
			groups: window.groups,
			memberships: window.memberships,
			groupsView: window.query.view === 'groups',
			selectedGroupId: window.query.group,
			setNames: Object.fromEntries(window.sets.map((s) => [s.code, s.name])),
			viewedAt: new Date(window.viewedAt),
			stats: {
				total: window.totals.copyCount,
				unique: window.totals.canonicalCardCount,
				foils: window.totals.foilEntryCount,
				sets: window.totals.setCount,
				completedSets: 0
			}
		};
	} catch (cause) {
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			error(401, 'Authentication required');
		if (cause instanceof ValidationError) {
			if (cause.message === 'Inventory group not found') error(404, cause.message);
			error(400, cause.message);
		}
		throw cause;
	}
};

function groupFailure(cause: unknown) {
	if (cause instanceof ValidationError) return fail(400, { message: cause.message });
	if (cause instanceof InventoryGroupNotFoundError) return fail(404, { message: cause.message });
	throw cause;
}

export const actions: Actions = {
	createGroup: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const group = await createInventoryGroup(
				locals.user.accountId,
				String(form.get('name') ?? ''),
				DEFAULT_GAME
			);
			return { success: true, groupId: group.id };
		} catch (cause) {
			return groupFailure(cause);
		}
	},
	renameGroup: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			await renameInventoryGroup(
				locals.user.accountId,
				String(form.get('groupId') ?? ''),
				String(form.get('name') ?? ''),
				DEFAULT_GAME
			);
			return { success: true };
		} catch (cause) {
			return groupFailure(cause);
		}
	},
	deleteGroup: async ({ request, locals, url }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		const groupId = String(form.get('groupId') ?? '');
		try {
			await deleteInventoryGroup(locals.user.accountId, groupId, DEFAULT_GAME);
		} catch (cause) {
			return groupFailure(cause);
		}
		if (url.searchParams.get('group')?.toLowerCase() === groupId.toLowerCase()) {
			throw redirect(303, '/mtg/inventory?view=groups');
		}
		return { success: true };
	},
	assignGroups: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			await replaceInventoryGroupMemberships(
				locals.user.accountId,
				String(form.get('entryId') ?? ''),
				form.getAll('groupId').map(String),
				DEFAULT_GAME
			);
			return { success: true };
		} catch (cause) {
			return groupFailure(cause);
		}
	},
	updateQuantity: async ({ request, locals }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
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
			throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
		}

		const form = await request.formData();
		const entryId = String(form.get('entryId') ?? '');
		if (!entryId) {
			return fail(400, { message: 'entryId is required' });
		}

		const expectedQuantity = Number(form.get('expectedQuantity'));
		if (!Number.isSafeInteger(expectedQuantity) || expectedQuantity < 1)
			return fail(400, { message: 'Review the entry quantity before removing it.' });
		try {
			await removeInventoryCard(locals.user.accountId, entryId, expectedQuantity);
		} catch (cause) {
			if (cause instanceof InventoryQuantityChangedError)
				return fail(409, { message: cause.message });
			throw cause;
		}
		return { success: true };
	}
};
