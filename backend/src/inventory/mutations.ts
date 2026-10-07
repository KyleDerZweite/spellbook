import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { CatalogApplication, CardDocument } from '@spellbook/contracts/catalog.ts';
import type {
	InventoryAcknowledgement,
	InventoryMutationApplication,
	InventorySource,
	InventoryFailure
} from '@spellbook/contracts/inventory.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { ActorError } from '../auth/local.ts';
import {
	inventoryCards,
	inventoryGroups,
	inventoryGroupMemberships,
	inventoryMutationRequests,
	userProfiles
} from '../db/schema.ts';
import {
	assertCondition,
	assertBoundedText,
	assertUuid,
	positiveQuantity,
	assertFinish,
	assertRequestId,
	normalizeQuantity,
	normalizeSource,
	INVENTORY_SOURCES,
	ValidationError
} from '../mtg/validation.ts';
import { mutationFingerprint, RequestConflictError } from '../decks/request-fingerprint.ts';
import { lockInventory, advanceInventoryRevision } from './write.ts';
import { previewMtgImport } from '../decks/import.ts';

export class InventoryNotFoundError extends ValidationError {
	readonly kindOfFailure = 'NotFound';
}
export class InventoryQuantityChangedError extends ValidationError {
	readonly kindOfFailure = 'QuantityChanged';
	constructor(
		readonly latestQuantity: Extract<
			InventoryFailure,
			{ kind: 'QuantityChanged' }
		>['latestQuantity']
	) {
		super('This entry changed. Review its quantity before removing it.');
	}
}
export class NotesConflictError extends ValidationError {
	readonly kindOfFailure = 'NotesConflict';
	constructor(
		readonly latest: Pick<
			Extract<InventoryFailure, { kind: 'NotesConflict' }>,
			'entryId' | 'notes' | 'notesRevision'
		>
	) {
		super(
			'Notes changed. Your draft has been retained. Review the latest saved Notes before retrying.'
		);
	}
}
const record = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new ValidationError('Invalid Inventory operation');
	return value as Record<string, unknown>;
};
function notes(value: Record<string, unknown>) {
	if (!Object.hasOwn(value, 'notes')) return {};
	const note = assertBoundedText(value.notes, 'notes', 4000);
	const revision =
		value.notesRevision === undefined
			? undefined
			: assertBoundedText(value.notesRevision, 'notesRevision', 20);
	if (revision !== undefined && !/^(0|[1-9][0-9]*)$/.test(revision))
		throw new ValidationError('Invalid Notes revision');
	return { notes: note, notesRevision: revision };
}
function groupName(value: unknown) {
	const name = assertBoundedText(value, 'name', 256).trim();
	if (Array.from(name).length < 1 || Array.from(name).length > 64)
		throw new ValidationError('Group name must contain 1 to 64 characters');
	return name;
}
type Operation =
	| {
			op: 'add';
			catalogCardId: string;
			finish: string;
			condition: string;
			quantity: number;
			notes?: string;
			notesRevision?: string;
	  }
	| {
			op: 'patch';
			entryId: string;
			quantity?: number;
			delta?: number;
			floor: 0 | 1;
			notes?: string;
			notesRevision?: string;
	  }
	| { op: 'remove'; entryId: string; expectedQuantity?: number }
	| { op: 'group-create'; name: string }
	| { op: 'group-rename'; groupId: string; name: string }
	| { op: 'group-delete'; groupId: string }
	| { op: 'memberships'; entryId: string; groupIds: string[] }
	| { op: 'reorder'; entryId: string; position: number };
export interface InventoryIntent {
	requestId: string;
	source: InventorySource;
	operations: Operation[];
	import?: { text: string; finish: string; condition: string };
}
export interface PreparedInventoryMutation {
	actor: AuthUser;
	accountId: string;
	input: InventoryIntent;
	hash: string;
	printings: Map<string, CardDocument>;
	importSummary?: InventoryAcknowledgement['import'];
}
type Entry = typeof inventoryCards.$inferSelect;
const change = (entry: Entry, delta: number) => ({
	entryId: entry.id,
	catalogCardId: entry.catalogCardId,
	finish: entry.finish,
	condition: entry.condition,
	quantity: entry.quantity,
	delta,
	notesRevision: entry.notesRevision
});
function patchOperation(value: Record<string, unknown>, floor: 0 | 1): Operation {
	const entryId = assertUuid(value.entryId, 'entryId');
	const hasQuantity = value.quantity !== undefined,
		hasDelta = value.delta !== undefined;
	if (hasQuantity && hasDelta) throw new ValidationError('Supply quantity or delta, not both');
	if (!hasQuantity && !hasDelta && !Object.hasOwn(value, 'notes'))
		throw new ValidationError('Supply a changed field');
	const delta = hasDelta ? normalizeQuantity(value.delta) : undefined;
	if (delta === 0) throw new ValidationError('Delta must not be zero');
	return {
		op: 'patch',
		entryId,
		floor,
		...(hasQuantity ? { quantity: normalizeQuantity(value.quantity) } : {}),
		...(hasDelta ? { delta } : {}),
		...notes(value)
	};
}
function addOperation(value: Record<string, unknown>): Operation {
	return {
		op: 'add',
		catalogCardId: assertUuid(
			value.catalogCardId ?? record(value.card).catalogCardId,
			'catalogCardId'
		),
		finish: assertFinish(value.finish),
		condition: assertCondition(value.condition),
		quantity: positiveQuantity(value.quantity),
		...notes(value)
	};
}
function bulkOperation(value: unknown): Operation {
	const v = record(value);
	if (v.op === 'add') return addOperation(v);
	const entryId = assertUuid(record(v.target).entryId, 'entryId');
	if (v.op === 'remove') return { op: 'remove', entryId };
	if (v.op === 'decrement')
		return patchOperation(
			{ ...v, entryId, quantity: undefined, delta: -positiveQuantity(v.quantity) },
			0
		);
	if (v.op === 'set') return patchOperation({ ...v, entryId }, 0);
	throw new ValidationError('Unsupported Inventory operation');
}
function intent(
	input: { requestId: string; source?: InventorySource; game?: 'mtg' },
	operations: Operation[]
): InventoryIntent {
	if (input.game !== undefined && input.game !== 'mtg')
		throw new ValidationError('Only MTG Inventory is supported');
	return {
		requestId: assertRequestId(input.requestId),
		source: normalizeSource(input.source, INVENTORY_SOURCES, 'web'),
		operations
	};
}
function empty(requestId: string): InventoryAcknowledgement {
	return {
		requestId,
		inventoryId: null,
		revision: '0',
		changes: [],
		removedEntryIds: [],
		groups: [],
		removedGroupIds: [],
		memberships: [],
		legacy: true
	};
}

export function createInventoryWriter(
	db: Database,
	catalog: CatalogApplication,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
) {
	async function replay(
		executor: Database | Transaction,
		accountId: string,
		input: InventoryIntent,
		hash: string
	) {
		const [request] = await executor
			.select()
			.from(inventoryMutationRequests)
			.where(
				and(
					eq(inventoryMutationRequests.accountId, accountId),
					eq(inventoryMutationRequests.requestId, input.requestId)
				)
			)
			.limit(1);
		if (!request) return null;
		if (request.requestHash && request.requestHash !== hash) throw new RequestConflictError();
		return request.acknowledgement ?? empty(input.requestId);
	}
	async function authorize(tx: Transaction, accountId: string, actor: AuthUser) {
		await tx
			.select({ id: userProfiles.accountId })
			.from(userProfiles)
			.where(eq(userProfiles.accountId, accountId))
			.for('update');
		const current = await auth.requireActor(actor, tx);
		if (current.accountId !== accountId) throw new ActorError();
		return current.accountId;
	}
	function checkNotes(entry: Entry, operation: { notes?: string; notesRevision?: string }) {
		if (operation.notes === undefined) return;
		if (operation.notesRevision === undefined)
			throw new ValidationError('notesRevision is required when editing Notes');
		if (operation.notesRevision !== entry.notesRevision)
			throw new NotesConflictError({
				entryId: entry.id,
				notes: entry.notes,
				notesRevision: entry.notesRevision
			});
	}
	async function apply(
		tx: Transaction,
		accountId: string,
		inventoryId: string,
		operation: Operation,
		printings: Map<string, CardDocument>,
		ack: InventoryAcknowledgement
	): Promise<boolean> {
		const now = new Date();
		if (operation.op === 'add') {
			const printing = printings.get(operation.catalogCardId);
			if (!printing) throw new ValidationError('Catalog printing is unavailable');
			if (
				!(operation.finish === 'foil' ? printing.is_foil_available : printing.is_nonfoil_available)
			)
				throw new ValidationError('Printing does not support this finish');
			const where = and(
				eq(inventoryCards.inventoryId, inventoryId),
				eq(inventoryCards.catalogCardId, printing.id),
				eq(inventoryCards.finish, operation.finish),
				eq(inventoryCards.condition, operation.condition)
			);
			const [existing] = await tx.select().from(inventoryCards).where(where).for('update');
			let entry: Entry;
			if (existing) {
				checkNotes(existing, operation);
				const [updated] = await tx
					.update(inventoryCards)
					.set({
						quantity: positiveQuantity(existing.quantity + operation.quantity),
						...(operation.notes === undefined
							? {}
							: {
									notes: operation.notes,
									notesRevision:
										operation.notes === existing.notes
											? existing.notesRevision
											: String(BigInt(existing.notesRevision) + 1n)
								}),
						updatedAt: now
					})
					.where(where)
					.returning();
				entry = updated;
			} else {
				const [last] = await tx
					.select({ position: inventoryCards.spellbookPosition })
					.from(inventoryCards)
					.where(eq(inventoryCards.inventoryId, inventoryId))
					.orderBy(desc(inventoryCards.spellbookPosition))
					.limit(1);
				const position = (last?.position ?? -1) + 1;
				if (position > 2147483647)
					throw new ValidationError('Inventory display position range exhausted');
				const [created] = await tx
					.insert(inventoryCards)
					.values({
						id: crypto.randomUUID(),
						inventoryId,
						accountId,
						game: 'mtg',
						catalogCardId: printing.id,
						canonicalCardId: printing.oracle_id,
						name: printing.name,
						setCode: printing.set_code,
						imageUri: printing.image_uri,
						finish: operation.finish,
						condition: operation.condition,
						quantity: operation.quantity,
						notes: operation.notes ?? '',
						spellbookPosition: position,
						createdAt: now,
						updatedAt: now
					})
					.returning();
				entry = created;
			}
			ack.changes.push(change(entry, operation.quantity));
			return true;
		}
		if (operation.op.startsWith('group-')) {
			if (operation.op === 'group-create') {
				const [group] = await tx
					.insert(inventoryGroups)
					.values({
						id: crypto.randomUUID(),
						inventoryId,
						name: operation.name
					})
					.returning();
				ack.groups.push({ groupId: group.id, name: group.name });
				return true;
			}
			if (operation.op === 'group-rename' || operation.op === 'group-delete') {
				const where = and(
					eq(inventoryGroups.id, operation.groupId),
					eq(inventoryGroups.inventoryId, inventoryId)
				);
				const [group] = await tx.select().from(inventoryGroups).where(where).for('update');
				if (!group) throw new InventoryNotFoundError('Inventory group not found');
				if (operation.op === 'group-delete') {
					await tx.delete(inventoryGroups).where(where);
					ack.removedGroupIds.push(group.id);
					return true;
				}
				ack.groups.push({ groupId: group.id, name: operation.name });
				if (group.name === operation.name) return false;
				await tx.update(inventoryGroups).set({ name: operation.name, updatedAt: now }).where(where);
				return true;
			}
		}
		if (!('entryId' in operation)) throw new ValidationError('Unsupported Inventory operation');
		const where = and(
			eq(inventoryCards.id, operation.entryId),
			eq(inventoryCards.inventoryId, inventoryId),
			eq(inventoryCards.accountId, accountId),
			eq(inventoryCards.game, 'mtg')
		);
		const [entry] = await tx.select().from(inventoryCards).where(where).for('update');
		if (!entry) throw new InventoryNotFoundError('Inventory entry not found');
		if (operation.op === 'memberships') {
			if (operation.groupIds.length) {
				const groups = await tx
					.select({ id: inventoryGroups.id })
					.from(inventoryGroups)
					.where(
						and(
							eq(inventoryGroups.inventoryId, inventoryId),
							inArray(inventoryGroups.id, operation.groupIds)
						)
					)
					.orderBy(asc(inventoryGroups.id))
					.for('key share');
				if (groups.length !== operation.groupIds.length)
					throw new InventoryNotFoundError('Inventory group not found');
			}
			const current = await tx
				.select({ id: inventoryGroupMemberships.groupId })
				.from(inventoryGroupMemberships)
				.where(eq(inventoryGroupMemberships.entryId, entry.id));
			ack.memberships.push({ entryId: entry.id, groupIds: operation.groupIds });
			if (JSON.stringify(current.map((g) => g.id).sort()) === JSON.stringify(operation.groupIds))
				return false;
			await tx
				.delete(inventoryGroupMemberships)
				.where(eq(inventoryGroupMemberships.entryId, entry.id));
			if (operation.groupIds.length)
				await tx.insert(inventoryGroupMemberships).values(
					operation.groupIds.map((groupId) => ({
						groupId,
						entryId: entry.id
					}))
				);
			return true;
		}
		if (operation.op === 'remove') {
			if (operation.expectedQuantity !== undefined && entry.quantity !== operation.expectedQuantity)
				throw new InventoryQuantityChangedError(entry.quantity);
			await tx.delete(inventoryCards).where(where);
			ack.removedEntryIds.push(entry.id);
			ack.changes.push(change({ ...entry, quantity: 0 }, -entry.quantity));
			return true;
		}
		if (operation.op === 'reorder') {
			const ordered = await tx
				.select({
					id: inventoryCards.id,
					position: inventoryCards.spellbookPosition
				})
				.from(inventoryCards)
				.where(eq(inventoryCards.inventoryId, inventoryId))
				.orderBy(asc(inventoryCards.spellbookPosition), asc(inventoryCards.id));
			const old = ordered.findIndex((e) => e.id === entry.id);
			const target = Math.min(operation.position, ordered.length - 1);
			if (old === target) {
				ack.changes.push(change(entry, 0));
				return false;
			}
			const [moved] = ordered.splice(old, 1);
			ordered.splice(target, 0, moved);
			let changed = false;
			for (let i = 0; i < ordered.length; i++)
				if (ordered[i].position !== i) {
					changed = true;
					await tx
						.update(inventoryCards)
						.set({ spellbookPosition: i, updatedAt: now })
						.where(eq(inventoryCards.id, ordered[i].id));
				}
			ack.changes.push(change(entry, 0));
			return changed;
		}
		checkNotes(entry, operation);
		const quantity =
			operation.delta === undefined
				? (operation.quantity ?? entry.quantity)
				: Math.max(operation.floor, entry.quantity + operation.delta);
		normalizeQuantity(quantity);
		if (quantity <= 0) {
			await tx.delete(inventoryCards).where(where);
			ack.removedEntryIds.push(entry.id);
			ack.changes.push(change({ ...entry, quantity: 0 }, -entry.quantity));
			return true;
		}
		const nextNotes = operation.notes ?? entry.notes;
		const changed = quantity !== entry.quantity || nextNotes !== entry.notes;
		const updated = {
			...entry,
			quantity,
			notes: nextNotes,
			notesRevision:
				nextNotes === entry.notes ? entry.notesRevision : String(BigInt(entry.notesRevision) + 1n)
		};
		if (changed)
			await tx
				.update(inventoryCards)
				.set({
					quantity,
					notes: nextNotes,
					notesRevision: updated.notesRevision,
					updatedAt: now
				})
				.where(where);
		ack.changes.push(change(updated, quantity - entry.quantity));
		return changed;
	}
	async function prepare(actor: AuthUser, input: InventoryIntent, hash: string) {
		const current = await auth.requireActor(actor);
		const prior = await replay(db, current.accountId, input, hash);
		if (prior) return { kind: 'Recorded' as const, acknowledgement: prior };
		let importSummary: InventoryAcknowledgement['import'];
		if (input.import) {
			const preview = await previewMtgImport(catalog, input.import.text);
			input.operations = preview.resolved
				.filter(({ line }) => line.role === 'main')
				.map(({ line, card }) =>
					addOperation({
						catalogCardId: card.id,
						quantity: line.quantity,
						finish: input.import!.finish,
						condition: input.import!.condition
					})
				);
			if (!input.operations.length)
				throw new ValidationError('No resolved Inventory lines to commit');
			if (input.operations.length > 1000)
				throw new ValidationError('Supply at most 1000 Inventory import lines');
			importSummary = {
				resolvedCount: input.operations.length,
				unresolvedCount: preview.unresolved.length,
				ambiguousCount: preview.ambiguous.length
			};
		}
		const printings = new Map<string, CardDocument>();
		for (const operation of input.operations)
			if (operation.op === 'add' && !printings.has(operation.catalogCardId))
				printings.set(
					operation.catalogCardId,
					await catalog.getCatalogPrinting(operation.catalogCardId)
				);
		return {
			kind: 'Prepared' as const,
			mutation: {
				actor,
				accountId: current.accountId,
				input,
				hash,
				printings,
				importSummary
			}
		};
	}
	async function applyPrepared(tx: Transaction, prepared: PreparedInventoryMutation) {
		const { accountId, input, printings, importSummary } = prepared;
		const inventory = await lockInventory(tx, accountId, 'mtg');
		// Existing entries are locked before any Group, regardless of bulk operation order.
		const entryIds = new Set(
			input.operations.flatMap((operation) => ('entryId' in operation ? [operation.entryId] : []))
		);
		for (const operation of input.operations)
			if (operation.op === 'add') {
				const matches = await tx
					.select({ id: inventoryCards.id })
					.from(inventoryCards)
					.where(
						and(
							eq(inventoryCards.inventoryId, inventory.id),
							eq(inventoryCards.catalogCardId, operation.catalogCardId),
							eq(inventoryCards.finish, operation.finish),
							eq(inventoryCards.condition, operation.condition)
						)
					);
				for (const match of matches) entryIds.add(match.id);
			}
		if (entryIds.size)
			await tx
				.select({ id: inventoryCards.id })
				.from(inventoryCards)
				.where(
					and(
						eq(inventoryCards.inventoryId, inventory.id),
						inArray(inventoryCards.id, [...entryIds].sort())
					)
				)
				.orderBy(asc(inventoryCards.id))
				.for('update');
		const groupIds = [
			...new Set(
				input.operations.flatMap((operation) =>
					'groupId' in operation
						? [operation.groupId]
						: operation.op === 'memberships'
							? operation.groupIds
							: []
				)
			)
		].sort();
		if (groupIds.length)
			await tx
				.select({ id: inventoryGroups.id })
				.from(inventoryGroups)
				.where(
					and(eq(inventoryGroups.inventoryId, inventory.id), inArray(inventoryGroups.id, groupIds))
				)
				.orderBy(asc(inventoryGroups.id))
				.for('update');
		const ack: InventoryAcknowledgement = {
			requestId: input.requestId,
			inventoryId: inventory.id,
			revision: inventory.revision,
			changes: [],
			removedEntryIds: [],
			groups: [],
			removedGroupIds: [],
			memberships: [],
			...(importSummary ? { import: importSummary } : {})
		};
		let changed = false;
		for (const operation of input.operations)
			changed = (await apply(tx, accountId, inventory.id, operation, printings, ack)) || changed;
		if (changed) {
			await advanceInventoryRevision(tx, inventory.id);
			ack.revision = String(BigInt(inventory.revision) + 1n);
		}
		return ack;
	}
	async function recordReceipt(
		tx: Transaction,
		prepared: PreparedInventoryMutation,
		ack: InventoryAcknowledgement
	) {
		const { accountId, input, hash } = prepared;
		await tx.insert(inventoryMutationRequests).values({
			accountId,
			requestId: input.requestId,
			requestHash: hash,
			acknowledgement: ack,
			source: input.source,
			status: 'applied'
		});
	}
	return {
		prepare,
		authorize: (tx: Transaction, prepared: PreparedInventoryMutation) =>
			authorize(tx, prepared.accountId, prepared.actor),
		replay: (tx: Transaction, prepared: PreparedInventoryMutation) =>
			replay(tx, prepared.accountId, prepared.input, prepared.hash),
		apply: applyPrepared,
		recordReceipt
	};
}

export function createInventoryMutations(
	db: Database,
	catalog: CatalogApplication,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
): InventoryMutationApplication {
	const writer = createInventoryWriter(db, catalog, auth);
	async function mutate(
		actor: AuthUser,
		input: InventoryIntent
	): Promise<InventoryAcknowledgement> {
		const hash = mutationFingerprint({
			kind: input.import ? 'inventory_import' : 'inventory',
			source: input.source,
			...(input.import ? { import: input.import } : { operations: input.operations })
		});
		const prepared = await writer.prepare(actor, input, hash);
		if (prepared.kind === 'Recorded') return prepared.acknowledgement;
		try {
			return await db.transaction(async (tx) => {
				await writer.authorize(tx, prepared.mutation);
				const recorded = await writer.replay(tx, prepared.mutation);
				if (recorded) return recorded;
				const acknowledgement = await writer.apply(tx, prepared.mutation);
				await writer.recordReceipt(tx, prepared.mutation, acknowledgement);
				return acknowledgement;
			});
		} catch (cause) {
			let error: unknown = cause;
			while (error && typeof error === 'object') {
				if (
					'code' in error &&
					error.code === '23505' &&
					'constraint' in error &&
					error.constraint === 'inventory_groups_inventory_name_idx'
				)
					throw new ValidationError('A group with this name already exists');
				error = 'cause' in error ? error.cause : null;
			}
			throw cause;
		}
	}
	return {
		previewImport: async (actor, input) => {
			await auth.requireActor(actor);
			return previewMtgImport(catalog, assertBoundedText(input, 'text', 200000));
		},
		commitImport: async (actor, input) =>
			mutate(actor, {
				...intent({ requestId: input.requestId, source: input.source ?? 'import' }, []),
				import: {
					text: assertBoundedText(input.text, 'text', 200000).replace(/\r\n?/g, '\n').trim(),
					finish: assertFinish(input.defaultFinish ?? 'nonfoil'),
					condition: assertCondition(input.defaultCondition ?? 'NM')
				}
			}),
		add: async (actor, input) => mutate(actor, intent(input, [addOperation(record(input))])),
		patchEntry: async (actor, input) =>
			mutate(actor, intent(input, [patchOperation(record(input), 1)])),
		remove: async (actor, input) =>
			mutate(
				actor,
				intent(input, [
					{
						op: 'remove',
						entryId: assertUuid(input.entryId, 'entryId'),
						expectedQuantity: positiveQuantity(input.expectedQuantity)
					}
				])
			),
		bulk: async (actor, input) => {
			if (
				!Array.isArray(input.operations) ||
				!input.operations.length ||
				input.operations.length > 1000
			)
				throw new ValidationError('Supply 1 to 1000 Inventory operations');
			return mutate(actor, intent(input, input.operations.map(bulkOperation)));
		},
		createGroup: async (actor, input) =>
			mutate(actor, intent(input, [{ op: 'group-create', name: groupName(input.name) }])),
		renameGroup: async (actor, input) =>
			mutate(
				actor,
				intent(input, [
					{
						op: 'group-rename',
						groupId: assertUuid(input.groupId, 'groupId'),
						name: groupName(input.name)
					}
				])
			),
		deleteGroup: async (actor, input) =>
			mutate(
				actor,
				intent(input, [{ op: 'group-delete', groupId: assertUuid(input.groupId, 'groupId') }])
			),
		replaceMemberships: async (actor, input) => {
			if (!Array.isArray(input.groupIds) || input.groupIds.length > 1000)
				throw new ValidationError('Invalid groupIds');
			return mutate(
				actor,
				intent(input, [
					{
						op: 'memberships',
						entryId: assertUuid(input.entryId, 'entryId'),
						groupIds: [...new Set(input.groupIds.map((g) => assertUuid(g, 'groupId')))].sort()
					}
				])
			);
		},
		reorder: async (actor, input) => {
			const position = normalizeQuantity(input.position);
			if (position < 0) throw new ValidationError('Invalid display position');
			return mutate(
				actor,
				intent(input, [{ op: 'reorder', entryId: assertUuid(input.entryId, 'entryId'), position }])
			);
		}
	};
}
