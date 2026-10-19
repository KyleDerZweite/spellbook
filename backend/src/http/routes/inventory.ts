import type { HttpDependencies, HttpRoute } from '../types.ts';
import { error, json, badRequestIfValidation } from '../errors.ts';
import { requireMobileAuth } from '../auth.ts';
import { readString, readNumber, readJsonObject, requireUuid } from '../request.ts';
import { inventoryQueryFromUrl } from '../../inventory/query.ts';
import {
	assertCondition,
	assertFinish,
	normalizeQuantity,
	normalizeSource,
	INVENTORY_SOURCES
} from '../../mtg/validation.ts';

export function createInventoryRoutes(deps: HttpDependencies): HttpRoute[] {
	const { application } = deps;
	const listInventory: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			const page = await application.inventory.page(
				auth.user,
				inventoryQueryFromUrl(context.url),
				context.url.searchParams.get('revision') ?? undefined
			);
			return json(page, { status: page.kind === 'RevisionChanged' ? 409 : 200 });
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const addInventory: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		if (!body?.requestId || !Array.isArray(body?.items)) {
			throw error(400, 'requestId and items are required');
		}

		try {
			const items = body.items.map((item: unknown) => {
				if (!item || typeof item !== 'object' || Array.isArray(item))
					error(400, 'Each inventory item must be an object');
				const input = item as Record<string, unknown>;
				return {
					catalogCardId: readString(input.catalogCardId, 'catalogCardId'),
					finish: readString(input.finish, 'finish', 'nonfoil'),
					condition: readString(input.condition, 'condition', 'NM'),
					quantity: readNumber(input.quantity, 'quantity', 1),
					...(Object.hasOwn(input, 'notes')
						? {
								notes: readString(input.notes, 'notes'),
								...(Object.hasOwn(input, 'notesRevision')
									? { notesRevision: readString(input.notesRevision, 'notesRevision') }
									: {})
							}
						: {})
				};
			});
			return json(
				await application.inventory.bulk(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					source: normalizeSource(
						readString(body.source, 'source', 'mobile'),
						INVENTORY_SOURCES,
						'mobile'
					),
					operations: items.map((item) => ({ op: 'add', ...item }))
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const patchInventoryEntry: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const entryId = requireUuid(context.params.entryId, 'entryId');
		const body = await readJsonObject(context.request);

		try {
			return json(
				await application.inventory.patchEntry(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					entryId,
					...(Object.hasOwn(body, 'quantity')
						? { quantity: normalizeQuantity(readNumber(body.quantity, 'quantity')) }
						: {}),
					...(Object.hasOwn(body, 'delta')
						? { delta: normalizeQuantity(readNumber(body.delta, 'delta')) }
						: {}),
					...(Object.hasOwn(body, 'notes')
						? {
								notes: readString(body.notes, 'notes'),
								notesRevision: readString(body.notesRevision, 'notesRevision')
							}
						: {}),
					source: 'mobile'
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const removeInventoryEntry: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const entryId = requireUuid(context.params.entryId, 'entryId');

		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.remove(auth.user, {
					entryId,
					requestId: readString(body.requestId, 'requestId'),
					expectedQuantity: readNumber(body.expectedQuantity, 'expectedQuantity'),
					source: 'mobile'
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const getInventoryEntry: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			const detail = await application.inventory.getEntry(
				auth.user,
				requireUuid(context.params.entryId, 'entryId')
			);
			if (!detail) error(404, 'Inventory entry not found');
			return json(detail);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const bulkInventory: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.bulk(auth.user, {
					requestId: readString(body.requestId, 'requestId', ''),
					source: normalizeSource(
						readString(body.source, 'source', 'mobile'),
						INVENTORY_SOURCES,
						'mobile'
					),
					operations: Array.isArray(body.operations) ? body.operations : []
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause, 'Invalid inventory bulk request');
		}
	};
	const listGroups: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			const page = await application.inventory.page(auth.user, {
				view: 'groups',
				offset: Number(context.url.searchParams.get('offset') ?? 0),
				limit: Number(context.url.searchParams.get('limit') ?? 50)
			});
			if (page.kind !== 'Page') throw new Error('Initial Groups must be current');
			return json({ revision: page.revision, groups: page.groupPage, count: page.groupCount });
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const createGroup: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.createGroup(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					name: readString(body.name, 'name')
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const renameGroup: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.renameGroup(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					groupId: context.params.groupId!,
					name: readString(body.name, 'name')
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const deleteGroup: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.deleteGroup(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					groupId: context.params.groupId!
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const replaceMemberships: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.replaceMemberships(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					entryId: context.params.entryId!,
					groupIds: body.groupIds as string[]
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const reorder: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.reorder(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					entryId: context.params.entryId!,
					position: body.position as number
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const locate: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		try {
			const revision = context.url.searchParams.get('revision');
			if (!revision) error(400, 'revision is required');
			const result = await application.inventory.locate(
				auth.user,
				inventoryQueryFromUrl(context.url),
				context.params.entryId,
				revision
			);
			return json(result, { status: result.kind === 'RevisionChanged' ? 409 : 200 });
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	const previewImport: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			assertFinish(body?.defaultFinish ?? 'nonfoil');
			assertCondition(body?.defaultCondition ?? 'NM');
			return json(
				await application.inventory.previewImport(auth.user, readString(body.text, 'text', ''))
			);
		} catch (cause) {
			badRequestIfValidation(cause, 'Invalid inventory import preview');
		}
	};
	const commitImport: HttpRoute['handle'] = async (context) => {
		const auth = await requireMobileAuth(context, deps);
		const body = await readJsonObject(context.request);
		try {
			return json(
				await application.inventory.commitImport(auth.user, {
					requestId: readString(body.requestId, 'requestId'),
					text: readString(body.text, 'text'),
					defaultFinish: readString(body.defaultFinish, 'defaultFinish', 'nonfoil'),
					defaultCondition: readString(body.defaultCondition, 'defaultCondition', 'NM'),
					source: normalizeSource(body.source, INVENTORY_SOURCES, 'import')
				})
			);
		} catch (cause) {
			badRequestIfValidation(cause);
		}
	};
	return [
		{ method: 'GET', path: '/api/mobile/v1/mtg/inventory', handle: listInventory },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory', handle: addInventory },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/batch-add', handle: addInventory },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/bulk', handle: bulkInventory },
		{ method: 'GET', path: '/api/mobile/v1/mtg/inventory/groups', handle: listGroups },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/groups', handle: createGroup },
		{ method: 'PATCH', path: '/api/mobile/v1/mtg/inventory/groups/:groupId', handle: renameGroup },
		{ method: 'DELETE', path: '/api/mobile/v1/mtg/inventory/groups/:groupId', handle: deleteGroup },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/import/preview', handle: previewImport },
		{ method: 'POST', path: '/api/mobile/v1/mtg/inventory/import/commit', handle: commitImport },
		{ method: 'GET', path: '/api/mobile/v1/mtg/inventory/:entryId', handle: getInventoryEntry },
		{ method: 'PATCH', path: '/api/mobile/v1/mtg/inventory/:entryId', handle: patchInventoryEntry },
		{
			method: 'DELETE',
			path: '/api/mobile/v1/mtg/inventory/:entryId',
			handle: removeInventoryEntry
		},
		{
			method: 'PUT',
			path: '/api/mobile/v1/mtg/inventory/:entryId/groups',
			handle: replaceMemberships
		},
		{ method: 'PATCH', path: '/api/mobile/v1/mtg/inventory/:entryId/position', handle: reorder },
		{ method: 'GET', path: '/api/mobile/v1/mtg/inventory/:entryId/location', handle: locate }
	];
}
