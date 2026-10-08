import { advanceDeckLibraryRevision } from './directory-revision.ts';
import { queueWholeDeckEvaluation } from '../categories/jobs.ts';
import {
	readDeckLibrary,
	readDeckLibraryCategories,
	locateDeck as locateDeckInLibrary
} from './library.ts';
import type {
	DeckLibraryInput,
	DeckLibraryCategoryInput
} from '@spellbook/contracts/deck-library.ts';
import { createValuation, PriceReadUnavailable } from '../valuation/read.ts';
import { deckValueEstimates } from './value.ts';
import type { DeckSnapshot } from '@spellbook/contracts/decks.ts';
import { readTransactionCatalogPrinting } from '../catalog/search.ts';
import { categoryTransaction } from '../categories/work.ts';
import { ensureEntryCategoryInitialization } from '../categories/persistence.ts';
import { requireCategoryMergePreview } from '../categories/merge.ts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import { ActorError, type createLocalAuth } from '../auth/local.ts';
import type { Database } from '../db/client.ts';
import { databaseInteger, DatabaseIntegerRangeError } from '../db/numbers.ts';
import {
	decks,
	deckCards,
	deckMutationRequests,
	inventoryCards,
	userProfiles
} from '../db/schema.ts';
import type { CatalogApplication, CardDocument } from '@spellbook/contracts/catalog.ts';
import type {
	Deck,
	DeckCard,
	DeckPatch,
	DeckBulkInput,
	DeckOperation,
	DeckAcknowledgement,
	DecksApplication
} from '@spellbook/contracts/decks.ts';
import {
	assertUuid,
	assertDeckOperation,
	assertDeckRole,
	assertRequestId,
	normalizeSource,
	DECK_SOURCES,
	normalizeQuantity,
	ValidationError
} from '../mtg/validation.ts';
import { mutationFingerprint, RequestConflictError } from './request-fingerprint.ts';
import { allocateDeckAvailability, canonicalQuantities } from './availability.ts';
import { previewMtgImport, isCommittedDeckRole, toCardIdentity } from './import.ts';
import { generateLegalityWarnings } from './legality.ts';
import { formatArenaDecklist } from './decklist.ts';
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type DeckRow = typeof decks.$inferSelect;
type CardRow = typeof deckCards.$inferSelect;
function deckDto(row: DeckRow): Deck {
	return {
		id: row.id,
		accountId: row.accountId,
		game: row.game,
		name: row.name,
		description: row.description,
		format: row.format,
		descriptionRevision: String(row.descriptionRevision),
		compositionRevision: String(row.compositionRevision),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}
function cardDto(row: CardRow): DeckCard {
	return {
		id: row.id,
		deckId: row.deckId,
		accountId: row.accountId,
		game: row.game,
		catalogCardId: row.catalogCardId,
		canonicalCardId: row.canonicalCardId,
		name: row.name,
		setCode: row.setCode,
		imageUri: row.imageUri,
		quantity: row.quantity,
		role: row.role,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}
function aggregateQuantity(value: string | number): number {
	const quantity = databaseInteger(value);
	if (quantity < 0) throw new DatabaseIntegerRangeError();
	return quantity;
}
export class DescriptionConflictError extends ValidationError {
	readonly conflict = 'DescriptionConflict';
	constructor(readonly latest: { description: string; descriptionRevision: string }) {
		super(
			'Description changed. Your draft has been retained. Review the latest saved description before retrying.'
		);
	}
}
export class DeckNotFoundError extends ValidationError {
	readonly notFound = true;
	constructor() {
		super('Deck or entry not found');
	}
}
function text(value: unknown, label: string, limit: number, fallback?: string): string {
	if (typeof value !== 'string') throw new ValidationError(`${label} must be a string`);
	const result = value.trim();
	if (result.length > limit || (!result && fallback === undefined))
		throw new ValidationError(`Invalid ${label}`);
	return result || fallback || '';
}
function game(value: string) {
	if (value !== 'mtg') throw new ValidationError('Only MTG is supported');
}
function categoryPreview(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string' || value.length > 12000)
		throw new ValidationError('Invalid category preview');
	return value;
}
function operations(input: unknown): DeckOperation[] {
	if (!Array.isArray(input) || !input.length)
		throw new ValidationError('operations must contain at least one operation');
	return input.map((op: unknown) => {
		if (
			op &&
			typeof op === 'object' &&
			'op' in op &&
			(op.op === 'replace' || op.op === 'increment')
		) {
			const v = op as Record<string, unknown>;
			const normalized = assertDeckOperation({ ...v, op: 'decrement' });
			if (normalized.op !== 'decrement') throw new ValidationError('Invalid operation');
			if (v.op === 'increment') return { ...normalized, op: 'increment' };
			return {
				...normalized,
				op: 'replace',
				catalogCardId: text(v.catalogCardId, 'catalogCardId', 100),
				role: assertDeckRole(v.role),
				categoryPreview: categoryPreview(v.categoryPreview)
			};
		}
		const normalized = assertDeckOperation(op);
		return normalized.op === 'move'
			? {
					...normalized,
					categoryPreview: categoryPreview((op as Record<string, unknown>).categoryPreview)
				}
			: normalized;
	});
}
export function nextDeckChoiceOffset(
	offset: number,
	limit: number,
	hasMore: boolean
): number | null {
	const next = offset + limit;
	return hasMore && next <= 1_000_000 ? next : null;
}

export function createDecks(
	db: Database,
	catalog: CatalogApplication,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor' | 'requireActorForWrite'>,
	valuation = createValuation(db.$client, auth)
): DecksApplication {
	async function authorizeWrite(tx: Tx, accountId: string, actor?: AuthUser) {
		if (!actor) throw new ActorError();
		await tx
			.select({ accountId: userProfiles.accountId })
			.from(userProfiles)
			.where(eq(userProfiles.accountId, accountId))
			.for('update');
		const current = await auth.requireActorForWrite(actor, tx);
		if (current.accountId !== accountId) throw new ActorError();
	}
	async function actorAccount(actor: AuthUser) {
		return (await auth.requireActor(actor)).accountId;
	}
	function readWithActor<Args extends unknown[], Result>(
		operation: (accountId: string, ...args: Args) => Promise<Result>
	) {
		return async (actor: AuthUser, ...args: Args) => operation(await actorAccount(actor), ...args);
	}

	async function requireDeck(
		accountId: string,
		deckId: string,
		tx: Database | Tx = db,
		lock = false
	) {
		const query = tx
			.select()
			.from(decks)
			.where(and(eq(decks.id, deckId), eq(decks.accountId, accountId)))
			.limit(1);
		const [deck] = await (lock ? query.for('update') : query);
		if (!deck) throw new DeckNotFoundError();
		return deck;
	}
	async function getDeckCardsForDeck(
		accountId: string,
		deckId: string,
		executor: Database | Tx = db
	) {
		await requireDeck(accountId, deckId, executor);
		return (
			await executor
				.select()
				.from(deckCards)
				.where(and(eq(deckCards.deckId, deckId), eq(deckCards.accountId, accountId)))
				.orderBy(asc(deckCards.role), asc(deckCards.name))
		).map(cardDto);
	}
	async function owned(accountId: string, canonicalIds: string[], executor: Database | Tx = db) {
		if (!canonicalIds.length) return [];
		const rows = await executor
			.select({
				catalogCardId: inventoryCards.catalogCardId,
				canonicalCardId: inventoryCards.canonicalCardId,
				quantity: sql<string>`sum(${inventoryCards.quantity})::text`
			})
			.from(inventoryCards)
			.where(
				and(
					eq(inventoryCards.accountId, accountId),
					eq(inventoryCards.game, 'mtg'),
					inArray(inventoryCards.canonicalCardId, canonicalIds)
				)
			)
			.groupBy(inventoryCards.catalogCardId, inventoryCards.canonicalCardId);
		return rows.map((row) => ({
			...row,
			quantity: aggregateQuantity(row.quantity)
		}));
	}
	async function readDeckState(
		accountId: string,
		requestedGame = 'mtg',
		selectedDeckId: string | null = null,
		independent = false
	) {
		game(requestedGame);
		return db.transaction(
			async (tx) => {
				const asOf = new Date(
					(await tx.execute<{ as_of: string }>(sql`SELECT statement_timestamp() AS as_of`)).rows[0]
						.as_of
				);
				const userDecks = await tx
					.select()
					.from(decks)
					.where(
						and(
							eq(decks.accountId, accountId),
							eq(decks.game, requestedGame),
							independent && selectedDeckId ? eq(decks.id, selectedDeckId) : undefined
						)
					)
					.orderBy(desc(decks.updatedAt), asc(decks.name));
				if (selectedDeckId && !userDecks.some((d) => d.id === selectedDeckId))
					throw new DeckNotFoundError();
				const summaries = await tx
					.select({
						deckId: deckCards.deckId,
						quantity: sql<string>`sum(${deckCards.quantity})::text`,
						imageUri: sql<string>`(array_agg(${deckCards.imageUri} order by case when ${deckCards.role}='commander' then 0 else 1 end, ${deckCards.name}, ${deckCards.id}))[1]`
					})
					.from(deckCards)
					.innerJoin(decks, eq(deckCards.deckId, decks.id))
					.where(
						and(
							eq(deckCards.accountId, accountId),
							eq(decks.accountId, accountId),
							eq(deckCards.game, 'mtg'),
							independent && selectedDeckId ? eq(deckCards.deckId, selectedDeckId) : undefined
						)
					)
					.groupBy(deckCards.deckId);
				const deckTotals = Object.fromEntries(
					summaries.map((row) => [row.deckId, aggregateQuantity(row.quantity)])
				);
				const deckCovers = Object.fromEntries(
					summaries.map((row) => [row.deckId, { imageUri: row.imageUri }])
				);
				const cards = selectedDeckId
					? await getDeckCardsForDeck(accountId, selectedDeckId, tx)
					: [];
				const ownedPrintings = await owned(
					accountId,
					[...new Set(cards.map((c) => c.canonicalCardId))],
					tx
				);
				const ownedByCanonical = canonicalQuantities(ownedPrintings);
				const availability = allocateDeckAvailability(cards, ownedPrintings);
				let valueEstimates: DeckSnapshot['valueEstimates'] = null;
				let valuationError: DeckSnapshot['valuationError'] = null;
				if (selectedDeckId) {
					await tx.execute(sql`SAVEPOINT deck_value_summary`);
					try {
						valueEstimates = await deckValueEstimates(tx, valuation, cards, availability, asOf);
					} catch {
						await tx.execute(sql`ROLLBACK TO SAVEPOINT deck_value_summary`);
						const failure = new PriceReadUnavailable();
						valuationError = { kind: failure.kind, message: failure.message };
					}
					await tx.execute(sql`RELEASE SAVEPOINT deck_value_summary`);
				}
				return {
					decks: userDecks.map(deckDto),
					deckTotals,
					deckCovers,
					deckCards: cards,
					availability,
					valueEstimates,
					valuationError,
					ownedByCanonical,
					ownedPrintings
				};
			},
			{ isolationLevel: 'repeatable read', accessMode: 'read only' }
		);
	}
	async function getDeckSnapshot(
		accountId: string,
		requestedGame = 'mtg',
		selectedDeckId: string | null = null
	) {
		return readDeckState(accountId, requestedGame, selectedDeckId);
	}
	async function availability(accountId: string, deckId: string) {
		const snapshot = await readDeckState(accountId, 'mtg', deckId, true);
		const entries = snapshot.deckCards.map((c) => ({
			entryId: c.id,
			required: c.quantity,
			...snapshot.availability[c.id]
		}));
		return {
			deckId,
			entries,
			totals: entries.reduce(
				(a, c) => ({
					required: a.required + c.required,
					exact: a.exact + c.exact,
					alternate: a.alternate + c.alternate,
					missing: a.missing + c.missing
				}),
				{ required: 0, exact: 0, alternate: 0, missing: 0 }
			)
		};
	}
	async function createDeckRecord(
		accountId: string,
		input: { game: string; name: string; description: string; format: string },
		actor?: AuthUser
	) {
		game(input.game);
		return categoryTransaction(db, async (tx) => {
			await authorizeWrite(tx, accountId, actor);
			const [deck] = await tx
				.insert(decks)
				.values({
					id: crypto.randomUUID(),
					accountId,
					game: input.game,
					name: text(input.name, 'name', 200),
					description: text(input.description, 'description', 4000, ''),
					format: text(input.format, 'format', 100, 'Commander')
				})
				.returning();
			await ensureEntryCategoryInitialization(tx, deck.id);
			await advanceDeckLibraryRevision(tx, accountId);
			return deckDto(deck);
		});
	}
	async function updateDeck(accountId: string, input: DeckPatch, actor?: AuthUser) {
		return db.transaction(async (tx) => {
			await authorizeWrite(tx, accountId, actor);
			const deck = await requireDeck(accountId, input.deckId, tx, true);
			if (
				input.description !== undefined &&
				input.descriptionRevision !== String(deck.descriptionRevision)
			)
				throw new DescriptionConflictError({
					description: deck.description,
					descriptionRevision: String(deck.descriptionRevision)
				});
			const patch: Partial<DeckRow> = { updatedAt: new Date() };
			if (input.name !== undefined) patch.name = text(input.name, 'name', 200);
			if (input.format !== undefined) patch.format = text(input.format, 'format', 100, 'Commander');
			if (input.description !== undefined) {
				patch.description = text(input.description, 'description', 4000, '');
				if (patch.description !== deck.description)
					patch.descriptionRevision = deck.descriptionRevision + 1n;
			}
			const changed =
				(patch.name !== undefined && patch.name !== deck.name) ||
				(patch.format !== undefined && patch.format !== deck.format) ||
				(patch.description !== undefined && patch.description !== deck.description);
			if (!changed) return deckDto(deck);
			const [updated] = await tx.update(decks).set(patch).where(eq(decks.id, deck.id)).returning();
			await advanceDeckLibraryRevision(tx, accountId);
			return deckDto(updated);
		});
	}
	async function deleteDeck(accountId: string, deckId: string, actor?: AuthUser) {
		await db.transaction(async (tx) => {
			await authorizeWrite(tx, accountId, actor);
			await requireDeck(accountId, deckId, tx, true);
			await tx.delete(decks).where(and(eq(decks.id, deckId), eq(decks.accountId, accountId)));
			await advanceDeckLibraryRevision(tx, accountId);
		});
	}
	async function apply(
		tx: Tx,
		accountId: string,
		deckId: string,
		operation: DeckOperation,
		now: Date,
		resolvedPrintings: Map<string, CardDocument>,
		decrementFloor: 0 | 1
	): Promise<
		DeckAcknowledgement['changes'][number] & {
			removed?: string;
			changed: boolean;
			initialize?: boolean;
		}
	> {
		if (operation.op === 'add') {
			const printing = resolvedPrintings.get(operation.card.catalogCardId);
			if (!printing) throw new ValidationError('Printing not found');
			const identity = toCardIdentity(printing);
			const [before] = await tx
				.select()
				.from(deckCards)
				.where(
					and(
						eq(deckCards.deckId, deckId),
						eq(deckCards.catalogCardId, identity.catalogCardId),
						eq(deckCards.role, operation.role || 'main')
					)
				)
				.limit(1);
			normalizeQuantity((before?.quantity || 0) + operation.quantity);
			const [saved] = await tx
				.insert(deckCards)
				.values({
					id: crypto.randomUUID(),
					accountId,
					deckId,
					game: 'mtg',
					...identity,
					quantity: operation.quantity,
					role: operation.role || 'main',
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: [deckCards.deckId, deckCards.catalogCardId, deckCards.role],
					set: {
						...identity,
						quantity: sql`${deckCards.quantity}+${operation.quantity}`,
						updatedAt: now
					}
				})
				.returning();
			return {
				entryId: saved.id,
				catalogCardId: saved.catalogCardId,
				role: saved.role,
				quantity: saved.quantity,
				changed: true,
				initialize: !before && saved.role === 'main',
				delta: saved.quantity - (before?.quantity || 0)
			};
		}
		const [entry] = await tx
			.select()
			.from(deckCards)
			.where(
				and(
					eq(deckCards.id, operation.target.entryId),
					eq(deckCards.deckId, deckId),
					eq(deckCards.accountId, accountId)
				)
			)
			.limit(1);
		if (!entry) throw new DeckNotFoundError();
		if (operation.op === 'move' || operation.op === 'replace') {
			let identity = {
				catalogCardId: entry.catalogCardId,
				canonicalCardId: entry.canonicalCardId,
				name: entry.name,
				setCode: entry.setCode,
				imageUri: entry.imageUri
			};
			if (operation.op === 'replace') {
				const printing = resolvedPrintings.get(operation.catalogCardId);
				if (!printing) throw new ValidationError('Printing not found');
				if (printing.oracle_id !== entry.canonicalCardId)
					throw new ValidationError('Choose a printing of the same card');
				identity = toCardIdentity(printing);
			}
			const quantity = operation.op === 'replace' ? operation.quantity : entry.quantity;
			const [destination] = await tx
				.select()
				.from(deckCards)
				.where(
					and(
						eq(deckCards.deckId, deckId),
						eq(deckCards.catalogCardId, identity.catalogCardId),
						eq(deckCards.role, operation.role)
					)
				)
				.limit(1);
			if (destination && destination.id !== entry.id) {
				await requireCategoryMergePreview(
					tx,
					{
						deckId,
						entryId: entry.id,
						catalogCardId: identity.catalogCardId,
						role: operation.role,
						quantity
					},
					operation.categoryPreview
				);
				// The retained destination row owns its complete category decision.

				normalizeQuantity(destination.quantity + quantity);
				const [saved] = await tx
					.update(deckCards)
					.set({ quantity: destination.quantity + quantity, updatedAt: now })
					.where(eq(deckCards.id, destination.id))
					.returning();
				await tx.delete(deckCards).where(eq(deckCards.id, entry.id));
				return {
					entryId: saved.id,
					catalogCardId: saved.catalogCardId,
					role: saved.role,
					quantity: saved.quantity,
					changed: true,
					delta: quantity,
					removed: entry.id
				};
			}
			const [saved] = await tx
				.update(deckCards)
				.set({ ...identity, quantity, role: operation.role, updatedAt: now })
				.where(eq(deckCards.id, entry.id))
				.returning();
			return {
				entryId: saved.id,
				catalogCardId: saved.catalogCardId,
				role: saved.role,
				quantity: saved.quantity,
				changed:
					saved.quantity !== entry.quantity ||
					saved.catalogCardId !== entry.catalogCardId ||
					saved.role !== entry.role,
				initialize: entry.role !== 'main' && saved.role === 'main',
				delta: saved.quantity - entry.quantity
			};
		}
		const quantity =
			operation.op === 'remove'
				? 0
				: operation.op === 'increment'
					? entry.quantity + operation.quantity
					: operation.op === 'decrement'
						? Math.max(decrementFloor, entry.quantity - operation.quantity)
						: operation.quantity;
		normalizeQuantity(quantity);
		if (quantity <= 0) await tx.delete(deckCards).where(eq(deckCards.id, entry.id));
		else if (quantity !== entry.quantity)
			await tx
				.update(deckCards)
				.set({ quantity, updatedAt: now })
				.where(eq(deckCards.id, entry.id));
		return {
			entryId: entry.id,
			catalogCardId: entry.catalogCardId,
			role: entry.role,
			quantity: Math.max(0, quantity),
			changed: Math.max(0, quantity) !== entry.quantity,
			delta: Math.max(0, quantity) - entry.quantity,
			...(quantity <= 0 ? { removed: entry.id } : {})
		};
	}
	async function mutation(
		accountId: string,
		input: DeckBulkInput,
		create?: { name: string; description: string; format: string },
		intent?: unknown,
		actor?: AuthUser,
		decrementFloor: 0 | 1 = 0,
		catalogAdd?: { catalogCardId: string; quantity: number; role: string }
	) {
		game(input.game);
		const requestId = assertRequestId(input.requestId);
		const source = normalizeSource(input.source, DECK_SOURCES, 'web');
		const normalized = catalogAdd ? [] : operations(input.operations);
		const hash =
			intent === undefined
				? mutationFingerprint({
						kind: create ? 'deck.import' : 'deck.bulk',
						...(create ? { create } : { deckId: input.deckId.toLowerCase() }),
						game: input.game,
						source,
						operations: normalized,
						...(decrementFloor ? { decrementFloor } : {})
					})
				: mutationFingerprint(intent);

		return categoryTransaction(db, async (tx) => {
			await authorizeWrite(tx, accountId, actor);
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([accountId, requestId])},0))`
			);
			const [previous] = await tx
				.select()
				.from(deckMutationRequests)
				.where(
					and(
						eq(deckMutationRequests.accountId, accountId),
						eq(deckMutationRequests.requestId, requestId)
					)
				)
				.limit(1);
			if (previous) {
				if (previous.requestHash !== null && previous.requestHash !== hash)
					throw new RequestConflictError();
				if (previous.acknowledgement) return previous.acknowledgement;
				// Legacy null-ack requests keep no-repeat semantics and expose no historical ledger.
				const priorDeck = await requireDeck(accountId, previous.deckId, tx, true);
				return {
					requestId,
					deckId: priorDeck.id,
					revision: String(priorDeck.compositionRevision),
					changes: [],
					removedEntryIds: []
				};
			}
			const resolvedPrintings = new Map<string, CardDocument>();
			if (catalogAdd) {
				const card = await readTransactionCatalogPrinting(tx, catalogAdd.catalogCardId);
				resolvedPrintings.set(card.id, card);
				normalized.push(
					...operations([
						{
							op: 'add',
							card: toCardIdentity(card),
							quantity: catalogAdd.quantity,
							role: catalogAdd.role
						}
					])
				);
			}
			for (const operation of normalized) {
				const printingId =
					operation.op === 'add'
						? operation.card.catalogCardId
						: operation.op === 'replace'
							? operation.catalogCardId
							: null;
				if (printingId && !resolvedPrintings.has(printingId))
					resolvedPrintings.set(printingId, await readTransactionCatalogPrinting(tx, printingId));
			}

			let deck: DeckRow;
			if (create) {
				const [row] = await tx
					.insert(decks)
					.values({
						id: crypto.randomUUID(),
						accountId,
						game: 'mtg',
						...create
					})
					.returning();
				deck = row;
			} else deck = await requireDeck(accountId, input.deckId, tx, true);
			const changes: DeckAcknowledgement['changes'] = [];
			const removedEntryIds: string[] = [];
			const now = new Date();
			let semanticChange = false;
			let initializeCategories = !!create;
			const categoryBefore = await tx.execute(
				sql`SELECT entry_id::text FROM deck_entry_category_decisions WHERE deck_id=${deck.id}::uuid`
			);
			for (const operation of normalized) {
				const change = await apply(
					tx,
					accountId,
					deck.id,
					operation,
					now,
					resolvedPrintings,
					decrementFloor
				);
				const { removed, changed, initialize, ...dto } = change;
				initializeCategories ||= !!initialize;
				semanticChange ||= changed;
				changes.push(dto);
				if (removed) removedEntryIds.push(removed);
			}
			const categoryEntryIds = initializeCategories
				? await ensureEntryCategoryInitialization(tx, deck.id)
				: [];
			const removedCategoryIds = categoryBefore.rows
				.map((row) => String(row.entry_id))
				.filter((id) => removedEntryIds.includes(id));
			if (removedCategoryIds.length)
				await tx.execute(
					sql`UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE deck_id=${deck.id}::uuid`
				);
			const categoryRevision = await tx.execute(
				sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${deck.id}::uuid`
			);
			const revision = deck.compositionRevision + (semanticChange ? 1n : 0n);
			if (semanticChange)
				await tx
					.update(decks)
					.set({ compositionRevision: revision, updatedAt: now })
					.where(eq(decks.id, deck.id));
			if (semanticChange) {
				await queueWholeDeckEvaluation(tx, deck.id);
				await advanceDeckLibraryRevision(tx, accountId);
			}
			const acknowledgement: DeckAcknowledgement = {
				requestId,
				deckId: deck.id,
				revision: String(revision),
				changes,
				removedEntryIds,
				...(categoryRevision.rows.length
					? {
							categoryDecisionRevision: String(categoryRevision.rows[0].decision_revision),
							categoryEntryIds: [...categoryEntryIds, ...removedCategoryIds]
						}
					: {})
			};
			await tx.insert(deckMutationRequests).values({
				accountId,
				requestId,
				requestHash: hash,
				deckId: deck.id,
				source,
				status: 'applied',
				acknowledgement,
				createdAt: now,
				updatedAt: now
			});
			return acknowledgement;
		});
	}
	async function bulkMutateDeckCards(accountId: string, input: DeckBulkInput, actor?: AuthUser) {
		return mutation(accountId, input, undefined, undefined, actor);
	}
	async function entryDeck(accountId: string, entryId: string) {
		const [entry] = await db
			.select({ deckId: deckCards.deckId })
			.from(deckCards)
			.where(and(eq(deckCards.id, entryId), eq(deckCards.accountId, accountId)))
			.limit(1);
		if (!entry) throw new DeckNotFoundError();
		return entry.deckId;
	}
	async function retryEntry(accountId: string, requestId: string) {
		const [row] = await db
			.select({ deckId: deckMutationRequests.deckId })
			.from(deckMutationRequests)
			.where(
				and(
					eq(deckMutationRequests.accountId, accountId),
					eq(deckMutationRequests.requestId, requestId)
				)
			)
			.limit(1);
		return row?.deckId;
	}
	async function updateDeckCard(
		accountId: string,
		entryId: string,
		quantity: number | undefined,
		role: string | undefined,
		requestId: string,
		delta?: number,
		actor?: AuthUser,
		source = 'web',
		preview?: string
	) {
		const deckId =
			(await retryEntry(accountId, requestId)) || (await entryDeck(accountId, entryId));
		return mutation(
			accountId,
			{
				deckId,
				requestId,
				source,
				game: 'mtg',
				operations: [
					...(quantity === undefined && delta === undefined
						? []
						: [
								{
									op:
										delta === undefined
											? ('set' as const)
											: delta > 0
												? ('increment' as const)
												: ('decrement' as const),
									target: { entryId },
									quantity: delta === undefined ? quantity! : Math.abs(delta)
								}
							]),
					...(role
						? [
								{
									op: 'move' as const,
									target: { entryId },
									role: assertDeckRole(role),
									categoryPreview: preview
								}
							]
						: [])
				]
			},
			undefined,
			undefined,
			actor,
			delta !== undefined && delta < 0 ? 1 : 0
		);
	}
	async function removeDeckCard(
		accountId: string,
		entryId: string,
		requestId: string,
		actor?: AuthUser,
		source = 'web'
	) {
		const deckId =
			(await retryEntry(accountId, requestId)) || (await entryDeck(accountId, entryId));
		return bulkMutateDeckCards(
			accountId,
			{
				deckId,
				requestId,
				source,
				game: 'mtg',
				operations: [{ op: 'remove', target: { entryId } }]
			},
			actor
		);
	}
	async function replayIntent(accountId: string, requestId: string, intent: unknown) {
		assertRequestId(requestId);
		const [previous] = await db
			.select()
			.from(deckMutationRequests)
			.where(
				and(
					eq(deckMutationRequests.accountId, accountId),
					eq(deckMutationRequests.requestId, requestId)
				)
			)
			.limit(1);
		if (!previous) return null;
		if (previous.requestHash !== null && previous.requestHash !== mutationFingerprint(intent))
			throw new RequestConflictError();
		return previous.acknowledgement;
	}

	async function addCatalogCardToDeck(
		accountId: string,
		input: {
			deckId: string;
			catalogCardId: string;
			quantity: number;
			role: string;
			requestId: string;
			source?: string;
		},
		actor?: AuthUser
	) {
		const normalized = {
			kind: 'deck.catalog.add',
			deckId: input.deckId.toLowerCase(),
			catalogCardId: input.catalogCardId.trim().toLowerCase(),
			quantity: normalizeQuantity(input.quantity),
			role: assertDeckRole(input.role),
			source: normalizeSource(input.source, DECK_SOURCES, 'web')
		};
		return mutation(
			accountId,
			{
				deckId: input.deckId,
				requestId: input.requestId,
				source: normalized.source,
				game: 'mtg',
				operations: []
			},
			undefined,
			normalized,
			actor,
			0,
			{
				catalogCardId: normalized.catalogCardId,
				quantity: normalized.quantity,
				role: normalized.role
			}
		);
	}
	async function addDeckCard(
		accountId: string,
		input: Parameters<DecksApplication['addDeckCard']>[1],
		actor?: AuthUser
	) {
		return addCatalogCardToDeck(accountId, { ...input, source: 'mobile' }, actor);
	}

	async function changeDeckPrinting(
		accountId: string,
		input: Parameters<DecksApplication['changeDeckPrinting']>[1],
		actor?: AuthUser
	) {
		const deckId =
			(await retryEntry(accountId, input.requestId)) || (await entryDeck(accountId, input.entryId));
		return bulkMutateDeckCards(
			accountId,
			{
				deckId,
				requestId: input.requestId,
				source: 'web',
				game: 'mtg',
				operations: [
					{
						op: 'replace',
						target: { entryId: input.entryId },
						catalogCardId: input.catalogCardId,
						quantity: input.quantity,
						role: assertDeckRole(input.role),
						categoryPreview: input.categoryPreview
					}
				]
			},
			actor
		);
	}
	async function importDeck(
		accountId: string,
		input: Parameters<DecksApplication['importDeck']>[1],
		actor?: AuthUser
	) {
		const create = {
			name: text(input.name, 'name', 200),
			description: text(input.description, 'description', 4000, ''),
			format: text(input.format, 'format', 100, 'Commander')
		};
		if (input.operations.some((o) => o.op !== 'add'))
			throw new ValidationError('Deck import accepts only add operations');
		return mutation(accountId, { ...input, deckId: '' }, create, undefined, actor);
	}
	async function preview(text: string, format = '') {
		if (typeof text !== 'string' || !text.trim() || text.length > 100000)
			throw new ValidationError('Paste a decklist of up to 100,000 characters.');
		return previewMtgImport(catalog, text, format);
	}
	function importOperations(result: Awaited<ReturnType<typeof preview>>) {
		return result.resolved.flatMap(({ line, card }) =>
			isCommittedDeckRole(line.role)
				? [
						{
							op: 'add' as const,
							card: toCardIdentity(card),
							quantity: line.quantity,
							role: line.role
						}
					]
				: []
		);
	}
	async function importIntoDeck(
		accountId: string,
		input: { deckId: string; text: string; requestId: string },
		actor?: AuthUser
	) {
		const normalized = {
			kind: 'deck.text',
			deckId: input.deckId.toLowerCase(),
			text: text(input.text, 'text', 100000)
		};
		const previous = await replayIntent(accountId, input.requestId, normalized);
		if (previous) return previous;
		const deck = await requireDeck(accountId, input.deckId);
		const result = await preview(normalized.text, deck.format);
		return mutation(
			accountId,
			{
				deckId: deck.id,
				requestId: input.requestId,
				source: 'import',
				game: 'mtg',
				operations: importOperations(result)
			},
			undefined,
			normalized,
			actor
		);
	}
	async function importTextDeck(
		accountId: string,
		input: Parameters<DecksApplication['importTextDeck']>[1],
		actor?: AuthUser
	) {
		game(input.game);
		const create = {
			name: text(input.name, 'name', 200),
			description: text(input.description, 'description', 4000, ''),
			format: text(input.format, 'format', 100, 'Commander')
		};
		const normalized = {
			kind: 'deck.text.import',
			...create,
			text: text(input.text, 'text', 100000),
			source: normalizeSource(input.source, DECK_SOURCES, 'import'),
			game: 'mtg'
		};
		const previous = await replayIntent(accountId, input.requestId, normalized);
		if (previous) return previous;
		const result = await preview(normalized.text, create.format);
		return mutation(
			accountId,
			{
				deckId: '',
				requestId: input.requestId,
				source: normalized.source,
				game: 'mtg',
				operations: importOperations(result)
			},
			create,
			normalized,
			actor
		);
	}

	async function resolve(cards: DeckCard[]) {
		const result = new Map<string, CardDocument>();
		const ids = [...new Set(cards.map((c) => c.catalogCardId))];
		for (let offset = 0; offset < ids.length; offset += 8) {
			for (const card of await Promise.all(
				ids.slice(offset, offset + 8).map(catalog.getCatalogPrinting)
			))
				result.set(card.id, card);
		}
		return result;
	}
	async function getDeckLegality(
		cards: DeckCard[],
		format: string,
		resolved?: Map<string, CardDocument>
	) {
		const documents = await resolve(cards);
		for (const [id, card] of documents) resolved?.set(id, card);
		return generateLegalityWarnings(
			cards.map((c) => ({
				quantity: c.quantity,
				role: assertDeckRole(c.role),
				card: documents.get(c.catalogCardId)!
			})),
			format
		);
	}
	async function exportDecklist(cards: DeckCard[]) {
		try {
			const documents = await resolve(cards);
			return formatArenaDecklist(
				cards.map((c) => ({
					...c,
					collectorNumber: documents.get(c.catalogCardId)!.collector_number
				}))
			);
		} catch {
			return formatArenaDecklist(cards);
		}
	}

	async function ownership(accountId: string, canonicalIds: string[]) {
		if (
			!Array.isArray(canonicalIds) ||
			canonicalIds.length > 100 ||
			canonicalIds.some((id) => typeof id !== 'string' || id.length > 100)
		)
			throw new ValidationError('Invalid canonical IDs');
		const printings = await owned(accountId, canonicalIds);
		canonicalQuantities(printings);
		return printings;
	}
	async function search(accountId: string, query: string) {
		const result = await catalog.searchCatalog(query);
		const ownedPrintings = await ownership(accountId, [
			...new Set(result.hits.map((card) => card.oracle_id))
		]);
		const ownedByCanonical = canonicalQuantities(ownedPrintings);
		return { ...result, ownedPrintings, ownedByCanonical };
	}
	return {
		getDeckSnapshot: readWithActor(getDeckSnapshot),
		getDeck: readWithActor(async (accountId: string, deckId: string) =>
			readDeckState(accountId, 'mtg', assertUuid(deckId, 'deckId'), true)
		),
		getDeckLibrary: readWithActor((accountId: string, input: DeckLibraryInput = {}) =>
			readDeckLibrary(db, accountId, input)
		),
		getDeckLibraryCategories: readWithActor(
			(accountId: string, input: DeckLibraryCategoryInput = {}) =>
				readDeckLibraryCategories(db, accountId, input)
		),
		locateDeck: readWithActor((accountId: string, deckId: string, input: DeckLibraryInput = {}) =>
			locateDeckInLibrary(db, accountId, deckId, input)
		),
		getDeckCardsForDeck: readWithActor(getDeckCardsForDeck),
		availability: readWithActor(availability),
		ownership: readWithActor(ownership),
		search: readWithActor(search),
		createDeckRecord: async (actor: AuthUser, input: Parameters<typeof createDeckRecord>[1]) =>
			createDeckRecord(actor.accountId, input, actor),
		updateDeck: async (actor: AuthUser, input: DeckPatch) =>
			updateDeck(await actorAccount(actor), input, actor),
		deleteDeck: async (actor: AuthUser, deckId: string) =>
			deleteDeck(await actorAccount(actor), deckId, actor),
		bulkMutateDeckCards: async (actor: AuthUser, input: DeckBulkInput) =>
			bulkMutateDeckCards(actor.accountId, input, actor),
		updateDeckCard: async (
			actor: AuthUser,
			entryId: string,
			quantity: number | undefined,
			role: string | undefined,
			requestId: string,
			delta?: number,
			source?: string,
			preview?: string
		) =>
			updateDeckCard(
				await actorAccount(actor),
				entryId,
				quantity,
				role,
				requestId,
				delta,
				actor,
				source,
				preview
			),
		removeDeckCard: async (actor: AuthUser, entryId: string, requestId: string, source?: string) =>
			removeDeckCard(await actorAccount(actor), entryId, requestId, actor, source),
		addDeckCard: async (actor: AuthUser, input: Parameters<DecksApplication['addDeckCard']>[1]) =>
			addDeckCard(actor.accountId, input, actor),
		addCatalogCardToDeck: async (
			actor: AuthUser,
			input: Parameters<DecksApplication['addCatalogCardToDeck']>[1]
		) => addCatalogCardToDeck(actor.accountId, input, actor),
		changeDeckPrinting: async (
			actor: AuthUser,
			input: Parameters<DecksApplication['changeDeckPrinting']>[1]
		) => changeDeckPrinting(await actorAccount(actor), input, actor),
		importIntoDeck: async (
			actor: AuthUser,
			input: Parameters<DecksApplication['importIntoDeck']>[1]
		) => importIntoDeck(await actorAccount(actor), input, actor),
		importTextDeck: async (
			actor: AuthUser,
			input: Parameters<DecksApplication['importTextDeck']>[1]
		) => importTextDeck(await actorAccount(actor), input, actor),
		importDeck: async (actor: AuthUser, input: Parameters<DecksApplication['importDeck']>[1]) =>
			importDeck(await actorAccount(actor), input, actor),
		previewMtgImport: async (actor: AuthUser, text: string, format?: string) => {
			await auth.requireActor(actor);
			return preview(text, format);
		},
		getDeckLegality: async (actor: AuthUser, deckId: string) => {
			const accountId = await actorAccount(actor);
			const deck = await requireDeck(accountId, deckId);
			const cards = await getDeckCardsForDeck(accountId, deckId);
			const documents = new Map<string, CardDocument>();
			const warnings = await getDeckLegality(cards, deck.format, documents);
			return { warnings, deckDocuments: Object.fromEntries(documents) };
		},
		exportDecklist: async (actor: AuthUser, deckId: string) =>
			exportDecklist(await getDeckCardsForDeck(await actorAccount(actor), deckId)),
		getDeckChoices: readWithActor(
			async (accountId: string, input: Parameters<DecksApplication['getDeckChoices']>[1] = {}) => {
				if (
					!input ||
					typeof input !== 'object' ||
					Array.isArray(input) ||
					Object.keys(input).some(
						(key) => !['query', 'offset', 'limit', 'selectedDeckId'].includes(key)
					)
				)
					throw new ValidationError('Invalid Deck choice options');
				const query = input.query === undefined ? '' : input.query,
					offset = input.offset === undefined ? 0 : input.offset,
					limit = input.limit === undefined ? 20 : input.limit;
				if (typeof query !== 'string' || query.length > 200 || query.includes('\0'))
					throw new ValidationError('query must be a string of at most 200 characters');
				if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
					throw new ValidationError('offset must be an integer between 0 and 1000000');
				if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
					throw new ValidationError('limit must be an integer between 1 and 50');
				const selectedDeckId =
					input.selectedDeckId === undefined
						? undefined
						: assertUuid(input.selectedDeckId, 'selectedDeckId');
				const fields = { id: decks.id, name: decks.name, format: decks.format };
				const owned = and(eq(decks.accountId, accountId), eq(decks.game, 'mtg'));
				const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
				const page = await db
					.select(fields)
					.from(decks)
					.where(and(owned, sql`${decks.name} ILIKE ${pattern} ESCAPE ${'\\'}`))
					.orderBy(sql`${decks.name} COLLATE "inventory_root"`, asc(decks.id))
					.limit(limit + 1)
					.offset(offset);
				const selected = selectedDeckId
					? ((
							await db
								.select(fields)
								.from(decks)
								.where(and(owned, eq(decks.id, selectedDeckId)))
								.limit(1)
						)[0] ?? null)
					: null;
				return {
					items: page.slice(0, limit),
					nextOffset: nextDeckChoiceOffset(offset, limit, page.length > limit),
					selected
				};
			}
		),
		getRecentDecks: readWithActor(async (accountId: string, requestedGame = 'mtg') => {
			game(requestedGame);
			return db
				.select({ id: decks.id, name: decks.name, format: decks.format })
				.from(decks)
				.where(and(eq(decks.accountId, accountId), eq(decks.game, requestedGame)))
				.orderBy(desc(decks.updatedAt), asc(decks.name))
				.limit(4);
		})
	} satisfies DecksApplication;
}
