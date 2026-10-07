import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { CatalogApplication, CardDocument } from '@spellbook/contracts/catalog.ts';
import type {
	InventoryAcknowledgement,
	InventoryMutationApplication,
	InventoryScanReviewInput,
	InventorySource
} from '@spellbook/contracts/inventory.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { ActorError } from '../auth/local.ts';
import {
	inventoryCards,
	inventoryGroups,
	inventoryGroupMemberships,
	inventoryMutationRequests,
	userProfiles,
	scanSessions,
	scanArtifacts,
	scanReviewItems
} from '../db/schema.ts';
import {
	assertCondition,
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
	constructor(readonly latestQuantity: number | null) {
		super('This entry changed. Review its quantity before removing it.');
	}
}
export class NotesConflictError extends ValidationError {
	readonly kindOfFailure = 'NotesConflict';
	constructor(readonly latest: { entryId: string; notes: string; notesRevision: string }) {
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
function text(value: unknown, field: string, limit: number) {
	if (typeof value !== 'string' || value.length > limit)
		throw new ValidationError(`${field} must be a string of at most ${limit} characters`);
	return value;
}
function id(value: unknown, field = 'entryId') {
	const result = text(value, field, 36).toLowerCase();
	if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(result))
		throw new ValidationError(`${field} must be a UUID`);
	return result;
}
function positive(value: unknown) {
	const result = normalizeQuantity(value);
	if (result <= 0) throw new ValidationError('Quantity must be greater than zero');
	return result;
}
function notes(value: Record<string, unknown>) {
	if (!Object.hasOwn(value, 'notes')) return {};
	const note = text(value.notes, 'notes', 4000);
	const revision =
		value.notesRevision === undefined ? undefined : text(value.notesRevision, 'notesRevision', 20);
	if (revision !== undefined && !/^(0|[1-9][0-9]*)$/.test(revision))
		throw new ValidationError('Invalid Notes revision');
	return { notes: note, notesRevision: revision };
}
function groupName(value: unknown) {
	const name = text(value, 'name', 256).trim();
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
interface Intent {
	requestId: string;
	source: InventorySource;
	operations: Operation[];
	scan?: { sessionId: string; items: InventoryScanReviewInput[] };
	import?: { text: string; finish: string; condition: string };
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
	const entryId = id(value.entryId);
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
		catalogCardId: id(value.catalogCardId ?? record(value.card).catalogCardId, 'catalogCardId'),
		finish: assertFinish(value.finish),
		condition: assertCondition(value.condition),
		quantity: positive(value.quantity),
		...notes(value)
	};
}
function bulkOperation(value: unknown): Operation {
	const v = record(value);
	if (v.op === 'add') return addOperation(v);
	const entryId = id(record(v.target).entryId);
	if (v.op === 'remove') return { op: 'remove', entryId };
	if (v.op === 'decrement')
		return patchOperation({ ...v, entryId, quantity: undefined, delta: -positive(v.quantity) }, 0);
	if (v.op === 'set') return patchOperation({ ...v, entryId }, 0);
	throw new ValidationError('Unsupported Inventory operation');
}
function intent(
	input: { requestId: string; source?: InventorySource; game?: 'mtg' },
	operations: Operation[]
): Intent {
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

export function createInventoryMutations(
	db: Database,
	catalog: CatalogApplication,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor'>
): InventoryMutationApplication {
	async function replay(
		executor: Database | Transaction,
		accountId: string,
		input: Intent,
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
						quantity: positive(existing.quantity + operation.quantity),
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
					.values({ id: crypto.randomUUID(), inventoryId, name: operation.name })
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
				await tx
					.insert(inventoryGroupMemberships)
					.values(operation.groupIds.map((groupId) => ({ groupId, entryId: entry.id })));
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
				.select({ id: inventoryCards.id, position: inventoryCards.spellbookPosition })
				.from(inventoryCards)
				.where(eq(inventoryCards.inventoryId, inventoryId))
				.orderBy(asc(inventoryCards.spellbookPosition), asc(inventoryCards.id));
			const old = ordered.findIndex((e) => e.id === entry.id);
			const target = Math.min(operation.position, ordered.length - 1);
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
				.set({ quantity, notes: nextNotes, notesRevision: updated.notesRevision, updatedAt: now })
				.where(where);
		ack.changes.push(change(updated, quantity - entry.quantity));
		return changed;
	}
	async function mutate(actor: AuthUser, input: Intent): Promise<InventoryAcknowledgement> {
		const current = await auth.requireActor(actor);
		const hash = mutationFingerprint({
			kind: input.scan ? 'scan_review' : input.import ? 'inventory_import' : 'inventory',
			...(input.scan ? { scan: input.scan } : {}),
			source: input.source,
			...(input.import ? { import: input.import } : { operations: input.operations })
		});
		const prior = await replay(db, current.accountId, input, hash);
		if (prior) return prior;
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
		try {
			return await db.transaction(async (tx) => {
				const accountId = await authorize(tx, current.accountId, actor);
				const recorded = await replay(tx, accountId, input, hash);
				if (recorded) return recorded;
				if (input.scan) {
					const [session] = await tx
						.select()
						.from(scanSessions)
						.where(
							and(eq(scanSessions.id, input.scan.sessionId), eq(scanSessions.accountId, accountId))
						)
						.for('update');
					if (!session) throw new InventoryNotFoundError('Scan session not found');
					if (!['open', 'pending_review'].includes(session.status))
						throw new ValidationError('Scan session is not open for review');
				}
				const inventory = await lockInventory(tx, accountId, 'mtg');
				// Existing entries are locked before any Group, regardless of bulk operation order.
				const entryIds = new Set(
					input.operations.flatMap((operation) =>
						'entryId' in operation ? [operation.entryId] : []
					)
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
							and(
								eq(inventoryGroups.inventoryId, inventory.id),
								inArray(inventoryGroups.id, groupIds)
							)
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
					changed =
						(await apply(tx, accountId, inventory.id, operation, printings, ack)) || changed;
				if (changed) {
					await advanceInventoryRevision(tx, inventory.id);
					ack.revision = String(BigInt(inventory.revision) + 1n);
				}
				if (input.scan) {
					for (const item of input.scan.items) {
						const [artifact] = await tx
							.select({ id: scanArtifacts.id })
							.from(scanArtifacts)
							.where(
								and(
									eq(scanArtifacts.id, item.scanArtifactId),
									eq(scanArtifacts.accountId, accountId),
									eq(scanArtifacts.sessionId, input.scan.sessionId)
								)
							)
							.limit(1);
						if (!artifact)
							throw new InventoryNotFoundError('Scan artifact not found in this session');
						const printing = printings.get(item.catalogCardId)!;
						const values = {
							catalogCardId: printing.id,
							canonicalCardId: printing.oracle_id,
							oracleId: printing.oracle_id,
							name: printing.name,
							setCode: printing.set_code,
							collectorNumber: printing.collector_number,
							imageUri: printing.image_uri,
							similarityScore: item.similarityScore,
							ocrScore: item.ocrScore,
							finalScore: item.finalScore,
							matchReason: item.matchReason,
							finish: item.finish,
							condition: item.condition,
							quantity: item.quantity,
							updatedAt: new Date()
						};
						const [review] = await tx
							.insert(scanReviewItems)
							.values({
								...values,
								id: item.id ?? crypto.randomUUID(),
								sessionId: input.scan.sessionId,
								scanArtifactId: item.scanArtifactId,
								accountId
							})
							.onConflictDoUpdate({
								target: scanReviewItems.id,
								set: values,
								setWhere: and(
									eq(scanReviewItems.accountId, accountId),
									eq(scanReviewItems.sessionId, input.scan.sessionId),
									eq(scanReviewItems.scanArtifactId, item.scanArtifactId)
								)
							})
							.returning({ id: scanReviewItems.id });
						if (!review)
							throw new ValidationError('Scan review belongs to another artifact or session');
					}
					await tx
						.update(scanSessions)
						.set({ status: 'committed', updatedAt: new Date() })
						.where(eq(scanSessions.id, input.scan.sessionId));
				}
				await tx.insert(inventoryMutationRequests).values({
					accountId,
					requestId: input.requestId,
					requestHash: hash,
					acknowledgement: ack,
					source: input.source,
					status: 'applied'
				});
				return ack;
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
			return previewMtgImport(catalog, text(input, 'text', 200000));
		},
		commitImport: (actor, input) =>
			mutate(actor, {
				...intent({ requestId: input.requestId, source: input.source ?? 'import' }, []),
				import: {
					text: text(input.text, 'text', 200000).replace(/\r\n?/g, '\n').trim(),
					finish: assertFinish(input.defaultFinish ?? 'nonfoil'),
					condition: assertCondition(input.defaultCondition ?? 'NM')
				}
			}),
		commitScanReview: (actor, input) => {
			const sessionId = id(input.sessionId, 'sessionId');
			if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100)
				throw new ValidationError('Supply 1 to 100 Scan review items');
			const score = (value: unknown) => {
				if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100)
					throw new ValidationError('Scan scores must be integers from zero to 100');
				return value;
			};
			const items = input.items.map((item) => {
				if (id(item.sessionId, 'sessionId') !== sessionId)
					throw new ValidationError('Scan review session mismatch');
				return {
					...(item.id === undefined ? {} : { id: id(item.id, 'id') }),
					sessionId,
					scanArtifactId: id(item.scanArtifactId, 'scanArtifactId'),
					catalogCardId: id(item.catalogCardId, 'catalogCardId'),
					similarityScore: score(item.similarityScore),
					ocrScore: score(item.ocrScore),
					finalScore: score(item.finalScore),
					matchReason: text(item.matchReason, 'matchReason', 500),
					finish: assertFinish(item.finish),
					condition: assertCondition(item.condition),
					quantity: positive(item.quantity)
				};
			});
			return mutate(actor, {
				...intent(
					{ requestId: input.requestId, source: 'scan_review' },
					items.map((item) => addOperation(record(item)))
				),
				scan: { sessionId, items }
			});
		},
		add: (actor, input) => mutate(actor, intent(input, [addOperation(record(input))])),
		patchEntry: (actor, input) => mutate(actor, intent(input, [patchOperation(record(input), 1)])),
		remove: (actor, input) =>
			mutate(
				actor,
				intent(input, [
					{
						op: 'remove',
						entryId: id(input.entryId),
						expectedQuantity: positive(input.expectedQuantity)
					}
				])
			),
		bulk: (actor, input) => {
			if (
				!Array.isArray(input.operations) ||
				!input.operations.length ||
				input.operations.length > 1000
			)
				throw new ValidationError('Supply 1 to 1000 Inventory operations');
			return mutate(actor, intent(input, input.operations.map(bulkOperation)));
		},
		createGroup: (actor, input) =>
			mutate(actor, intent(input, [{ op: 'group-create', name: groupName(input.name) }])),
		renameGroup: (actor, input) =>
			mutate(
				actor,
				intent(input, [
					{ op: 'group-rename', groupId: id(input.groupId, 'groupId'), name: groupName(input.name) }
				])
			),
		deleteGroup: (actor, input) =>
			mutate(actor, intent(input, [{ op: 'group-delete', groupId: id(input.groupId, 'groupId') }])),
		replaceMemberships: (actor, input) => {
			if (!Array.isArray(input.groupIds) || input.groupIds.length > 1000)
				throw new ValidationError('Invalid groupIds');
			return mutate(
				actor,
				intent(input, [
					{
						op: 'memberships',
						entryId: id(input.entryId),
						groupIds: [...new Set(input.groupIds.map((g) => id(g, 'groupId')))].sort()
					}
				])
			);
		},
		reorder: (actor, input) => {
			const position = normalizeQuantity(input.position);
			if (position < 0) throw new ValidationError('Invalid display position');
			return mutate(
				actor,
				intent(input, [{ op: 'reorder', entryId: id(input.entryId), position }])
			);
		}
	};
}
