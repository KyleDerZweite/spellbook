import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getInventorySnapshot,
	removeInventoryCard,
	updateInventoryCard
} from '#lib/server/data/inventory.ts';
import {
	createInventoryGroup,
	deleteInventoryGroup,
	getInventoryGroups,
	InventoryGroupNotFoundError,
	renameInventoryGroup,
	replaceInventoryGroupMemberships
} from '#lib/server/data/inventory-groups.ts';
import { ValidationError } from '#lib/server/mtg/validation.ts';
import { DEFAULT_GAME } from '#lib/state/activeGame.svelte.ts';
import { getCatalogSetNames } from '#lib/server/catalog/search.ts';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login?returnTo=/mtg/inventory');
	}

	const { activeGame } = await parent();
	const game = activeGame ?? DEFAULT_GAME;
	const [snapshot, groupSnapshot] = await Promise.all([
		getInventorySnapshot(locals.user.accountId, game),
		getInventoryGroups(locals.user.accountId, game)
	]);
	const groupsView = url.searchParams.get('view') === 'groups';
	const requestedGroupId = url.searchParams.get('group');
	const selectedGroupId = requestedGroupId?.toLowerCase() ?? null;
	if (
		selectedGroupId !== null &&
		!groupSnapshot.groups.some((group) => group.id === selectedGroupId)
	) {
		error(404, 'Inventory group not found');
	}
	const setNames = await getCatalogSetNames(snapshot.cards.map((card) => card.setCode));
	return {
		...snapshot,
		...groupSnapshot,
		groupsView,
		selectedGroupId,
		setNames,
		viewedAt: new Date()
	};
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

		await removeInventoryCard(locals.user.accountId, entryId);
		return { success: true };
	}
};
