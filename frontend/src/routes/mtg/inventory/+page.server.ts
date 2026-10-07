import { error, fail, redirect, type ActionFailure } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	InventoryQuantityChangedError,
	InventoryNotFoundError,
	NotesConflictError,
	removeInventoryCard,
	updateInventoryCard
} from '#lib/server/data/inventory.ts';
import {
	createInventoryGroup,
	deleteInventoryGroup,
	renameInventoryGroup,
	replaceInventoryGroupMemberships
} from '#lib/server/data/inventory-groups.ts';
import { RequestConflictError } from '#lib/server/data/request-fingerprint.ts';
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
			requestId: crypto.randomUUID(),
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
		if (
			cause &&
			typeof cause === 'object' &&
			'kind' in cause &&
			cause.kind === 'InvalidInventoryCount'
		)
			error(500, 'Inventory totals cannot be represented exactly.');
		if (cause && typeof cause === 'object' && 'kind' in cause && cause.kind === 'Unauthenticated')
			error(401, 'Authentication required');
		if (cause instanceof ValidationError) {
			if (cause.message === 'Inventory group not found') error(404, cause.message);
			error(400, cause.message);
		}
		throw cause;
	}
};

interface NotesRecovery {
	entryId: string;
	notes: string;
	notesRevision: string;
	quantity: number;
	requestId: string;
	quantityBase: number;
	notesOriginal: string;
}
interface InventoryFormFailure {
	message: string;
	notesRecovery?: NotesRecovery;
	latestNotes?: { entryId: string; notes: string; notesRevision: string };
}
function mutationFailure(
	cause: unknown,
	draft?: NotesRecovery
): ActionFailure<InventoryFormFailure> {
	if (cause instanceof NotesConflictError)
		return fail(409, { message: cause.message, notesRecovery: draft, latestNotes: cause.latest });
	if (cause instanceof InventoryQuantityChangedError || cause instanceof RequestConflictError)
		return fail(409, { message: cause.message });
	if (cause instanceof InventoryNotFoundError)
		return fail(404, { message: cause.message, notesRecovery: draft });
	if (cause instanceof ValidationError)
		return fail(400, { message: cause.message, notesRecovery: draft });
	throw cause;
}
export const actions = {
	createGroup: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const acknowledgement = await createInventoryGroup(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				name: String(form.get('name') ?? '')
			});
			return { success: true, acknowledgement, groupId: acknowledgement.groups[0]?.groupId };
		} catch (cause) {
			return mutationFailure(cause);
		}
	},
	renameGroup: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const acknowledgement = await renameInventoryGroup(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				groupId: String(form.get('groupId') ?? ''),
				name: String(form.get('name') ?? '')
			});
			return { success: true, acknowledgement };
		} catch (cause) {
			return mutationFailure(cause);
		}
	},
	deleteGroup: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const acknowledgement = await deleteInventoryGroup(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				groupId: String(form.get('groupId') ?? '')
			});
			if (
				url.searchParams.get('group')?.toLowerCase() ===
				String(form.get('groupId') ?? '').toLowerCase()
			) {
				const next = new URL(url);
				next.searchParams.delete('group');
				next.searchParams.delete('/deleteGroup');
				next.searchParams.set('view', 'groups');
				redirect(303, next.pathname + next.search);
			}
			return { success: true, acknowledgement };
		} catch (cause) {
			return mutationFailure(cause);
		}
	},
	assignGroups: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const acknowledgement = await replaceInventoryGroupMemberships(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				entryId: String(form.get('entryId') ?? ''),
				groupIds: form.getAll('groupId').map(String)
			});
			return { success: true, acknowledgement };
		} catch (cause) {
			return mutationFailure(cause);
		}
	},
	updateQuantity: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		const quantityChanged =
			form.has('quantity') &&
			(!form.has('quantityBase') ||
				Number(form.get('quantity')) !== Number(form.get('quantityBase')));
		const notesChanged =
			form.has('notes') &&
			(!form.has('notesOriginal') ||
				String(form.get('notes')) !== String(form.get('notesOriginal')) ||
				form.has('rebaseNotesRevision'));
		const input: import('@spellbook/contracts/inventory.ts').InventoryPatch = {
			requestId: form.has('rebaseNotesRevision')
				? String(form.get('rebaseRequestId') ?? '')
				: String(form.get('requestId') ?? ''),
			entryId: String(form.get('entryId') ?? ''),
			...(form.has('delta')
				? { delta: Number(form.get('delta')) }
				: quantityChanged
					? { quantity: Number(form.get('quantity')) }
					: {}),
			...(notesChanged || (form.has('notes') && !quantityChanged && !form.has('delta'))
				? {
						notes: String(form.get('notes') ?? ''),
						notesRevision: String(
							form.get('rebaseNotesRevision') ?? form.get('notesRevision') ?? ''
						)
					}
				: {})
		};
		try {
			const acknowledgement = await updateInventoryCard(locals.user, input);
			return { success: true, acknowledgement };
		} catch (cause) {
			return mutationFailure(
				cause,
				form.has('notes')
					? {
							entryId: input.entryId,
							requestId: input.requestId,
							quantity: Number(form.get('quantity') ?? 1),
							quantityBase: Number(form.get('quantityBase') ?? form.get('quantity') ?? 1),
							notesOriginal: String(form.get('notesOriginal') ?? ''),
							notes: String(form.get('notes') ?? ''),
							notesRevision: input.notesRevision ?? ''
						}
					: undefined
			);
		}
	},
	remove: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/auth/login?returnTo=/mtg/inventory');
		const form = await request.formData();
		try {
			const acknowledgement = await removeInventoryCard(locals.user, {
				requestId: String(form.get('requestId') ?? ''),
				entryId: String(form.get('entryId') ?? ''),
				expectedQuantity: Number(form.get('expectedQuantity'))
			});
			return { success: true, acknowledgement };
		} catch (cause) {
			return mutationFailure(cause);
		}
	}
} satisfies Actions;
