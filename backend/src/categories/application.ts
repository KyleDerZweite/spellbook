import { publishCategoryChange } from './notification.ts';
import { categoryTransaction } from './work.ts';
import { sql } from 'drizzle-orm';
import type {
	CategoriesApplication,
	CategoryAcknowledgement,
	DeckEntryCategories,
	EntryDefinition
} from '@spellbook/contracts/categories.ts';
import type { AuthUser } from '@spellbook/contracts/auth.ts';
import type { Database, Transaction } from '../db/client.ts';
import type { createLocalAuth } from '../auth/local.ts';
import { ValidationError, assertDeckRole, normalizeQuantity } from '../mtg/validation.ts';
import { readCategoryMergePreview } from './merge.ts';
import { mutationFingerprint, RequestConflictError } from '../decks/request-fingerprint.ts';
import {
	adoptedDefinitions,
	ensureEntryCategoryInitialization,
	readDecisions
} from './persistence.ts';
import { starterDefinitions } from './rules.ts';
import type { DefinitionVersion } from '@spellbook/contracts/category-library.ts';
import { CategoryNotFound, CategoryConflict } from './errors.ts';
import { createCategoryLibrary } from './library.ts';
import type { CategoryLibraryApplication } from '@spellbook/contracts/category-library.ts';
import type { CategoryChangesApplication } from '@spellbook/contracts/category-library.ts';
import { createCategoryChanges } from './changes.ts';
import { createCategoryPreviews } from './previews.ts';
export { CategoryNotFound, CategoryConflict } from './errors.ts';
const pattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
	if (typeof value !== 'string' || !pattern.test(value))
		throw new ValidationError('Invalid category request UUID');
	return value.toLowerCase();
}
function strict(value: unknown, keys: string[]): Record<string, unknown> {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		Object.keys(value).some((k) => !keys.includes(k))
	)
		throw new ValidationError('Invalid category request fields');
	return value as Record<string, unknown>;
}
export function createCategories(
	db: Database,
	auth: Pick<ReturnType<typeof createLocalAuth>, 'requireActor' | 'requireActorForWrite'>
): CategoriesApplication & CategoryLibraryApplication & CategoryChangesApplication {
	async function owned(tx: Transaction, accountId: string, deckId: string, lock = false) {
		const result = await tx.execute(
			sql`SELECT id FROM decks WHERE id=${deckId}::uuid AND account_id=${accountId} AND game='mtg' ${lock ? sql`FOR UPDATE` : sql``}`
		);
		if (!result.rows.length) throw new CategoryNotFound();
	}
	async function read(tx: Transaction, deckId: string): Promise<DeckEntryCategories> {
		const bundle = await tx.execute(
			sql`SELECT definitions,decision_revision::text,library_revision::text,whole_deck_definitions,suppressed_origins FROM deck_category_bundles WHERE deck_id=${deckId}::uuid`
		);
		const suppressed = (bundle.rows[0]?.suppressed_origins as string[] | undefined) ?? [];
		const labels = await tx.execute(
			sql`SELECT o.id::text,v.definition->>'name' AS name FROM category_definition_origins o JOIN category_definition_versions v ON v.origin_id=o.id AND v.version=o.current_version JOIN decks d ON d.account_id=o.account_id AND d.id=${deckId}::uuid WHERE o.id=ANY(${'{' + suppressed.join(',') + '}'}::uuid[])`
		);
		const source = await tx.execute(
			sql`SELECT s.refresh_status,p.source_updated_at FROM oracle_tag_state s LEFT JOIN oracle_tag_publications p ON p.id=s.active_publication WHERE s.id=1`
		);
		const labelsById = new Map(labels.rows.map((r) => [String(r.id), String(r.name)]));
		const row = source.rows[0],
			status = row?.refresh_status as { kind?: string } | undefined;
		return {
			deckId,
			initialized: !!bundle.rows.length,
			decisionRevision: String(bundle.rows[0]?.decision_revision ?? '0'),
			definitions: (bundle.rows[0]?.definitions as EntryDefinition[]) ?? [],
			libraryRevision: String(bundle.rows[0]?.library_revision ?? '0'),
			wholeDeckDefinitions: (bundle.rows[0]?.whole_deck_definitions as DefinitionVersion[]) ?? [],
			suppressedOrigins: suppressed.map((originId) => ({
				originId,
				name: String(
					labelsById.get(originId) ??
						starterDefinitions.find((d) => d.id === originId)?.name ??
						'Unavailable historical origin'
				)
			})),
			decisions: await readDecisions(tx, deckId),
			sourceStatus: {
				kind:
					status?.kind === 'Failed'
						? 'Failed'
						: status?.kind === 'Succeeded'
							? 'Succeeded'
							: 'NeverAttempted',
				sourceTime: row?.source_updated_at
					? new Date(row.source_updated_at as string | Date).toISOString()
					: null
			}
		};
	}
	async function getDeckEntryCategories(actor: AuthUser, deck: string) {
		const deckId = uuid(deck);
		return categoryTransaction(
			db,
			async (tx) => {
				const { accountId } = await auth.requireActor(actor, tx);
				await owned(tx, accountId, deckId);
				return read(tx, deckId);
			},
			{ isolationLevel: 'repeatable read', accessMode: 'read only' }
		);
	}
	async function mutate(
		actor: AuthUser,
		input: Record<string, unknown>,
		manual: boolean
	): Promise<CategoryAcknowledgement> {
		const deckId = uuid(input.deckId),
			requestId = uuid(input.requestId);
		const entryId = manual ? uuid(input.entryId) : null;
		const categoryId = manual && input.categoryId !== null ? uuid(input.categoryId) : null;
		if (
			manual &&
			(typeof input.expectedDecisionRevision !== 'string' ||
				!/^\d+$/.test(input.expectedDecisionRevision))
		)
			throw new ValidationError('Category decision revision is required');
		const fingerprint = mutationFingerprint({
			kind: manual ? 'category.manual' : 'category.initialize',
			deckId,
			entryId,
			categoryId,
			expectedDecisionRevision: manual ? input.expectedDecisionRevision : null
		});
		return categoryTransaction(db, async (tx) => {
			const { accountId } = await auth.requireActor(actor, tx);
			await tx.execute(
				sql`SELECT account_id FROM user_profiles WHERE account_id=${accountId} FOR UPDATE`
			);
			await auth.requireActorForWrite(actor, tx);
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([accountId, requestId])},0))`
			);
			const replay = await tx.execute(
				sql`SELECT request_hash,acknowledgement FROM category_mutation_requests WHERE account_id=${accountId} AND request_id=${requestId}::uuid`
			);
			if (replay.rows.length) {
				if (replay.rows[0].request_hash !== fingerprint) throw new RequestConflictError();
				return replay.rows[0].acknowledgement as CategoryAcknowledgement;
			}
			await owned(tx, accountId, deckId, true);
			const previouslyInitialized = manual || !!(await adoptedDefinitions(tx, deckId));
			let entryIds: string[] = [];
			if (!manual) entryIds = await ensureEntryCategoryInitialization(tx, deckId);
			else {
				const definitions = await adoptedDefinitions(tx, deckId);
				if (!definitions || (categoryId && !definitions.some((d) => d.id === categoryId)))
					throw new CategoryNotFound();
				const entry = await tx.execute(
					sql`SELECT id FROM deck_cards WHERE id=${entryId}::uuid AND deck_id=${deckId}::uuid AND account_id=${accountId}`
				);
				if (!entry.rows.length) throw new CategoryNotFound();
				const latest = await read(tx, deckId);
				if (latest.decisionRevision !== input.expectedDecisionRevision)
					throw new CategoryConflict(latest);
				const existing = latest.decisions.find((decision) => decision.entryId === entryId);
				if (
					existing?.state !== 'Manual' ||
					existing.categoryId !== categoryId ||
					existing.evidence !== null
				) {
					const selected = definitions.find((d) => d.id === categoryId);
					const snapshot = selected?.definitionSnapshot ?? selected ?? null;
					await tx.execute(
						sql`INSERT INTO deck_entry_category_decisions(entry_id,deck_id,category_id,state,evidence,definition_snapshot,previous_evaluation) VALUES(${entryId}::uuid,${deckId}::uuid,${categoryId}::uuid,'Manual',NULL,${snapshot ? JSON.stringify(snapshot) : null}::jsonb,${existing?.evidence ? JSON.stringify(existing.evidence) : null}::jsonb) ON CONFLICT(entry_id) DO UPDATE SET category_id=EXCLUDED.category_id,state='Manual',revision=deck_entry_category_decisions.revision+1,evidence=NULL,definition_snapshot=EXCLUDED.definition_snapshot,previous_evaluation=COALESCE(EXCLUDED.previous_evaluation,deck_entry_category_decisions.previous_evaluation)`
					);
					await tx.execute(
						sql`UPDATE deck_category_bundles SET decision_revision=decision_revision+1 WHERE deck_id=${deckId}::uuid`
					);
					entryIds = [entryId!];
				}
			}
			const revision = await tx.execute(
				sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${deckId}::uuid`
			);
			const acknowledgement: CategoryAcknowledgement = {
				requestId,
				deckId,
				decisionRevision: String(revision.rows[0].decision_revision),
				entryIds
			};
			await tx.execute(
				sql`INSERT INTO category_mutation_requests(account_id,request_id,request_hash,acknowledgement) VALUES(${accountId},${requestId}::uuid,${fingerprint},${JSON.stringify(acknowledgement)}::jsonb)`
			);
			if (entryIds.length || !previouslyInitialized) {
				await publishCategoryChange(tx, accountId);
			}
			return acknowledgement;
		});
	}
	return {
		...createCategoryLibrary(db, auth),
		...createCategoryChanges(db, auth),
		...createCategoryPreviews(db, auth),
		previewEntryMerge: async (actor, value) => {
			const input = strict(value, ['deckId', 'entryId', 'catalogCardId', 'role', 'quantity']);
			const normalized = {
				deckId: uuid(input.deckId),
				entryId: uuid(input.entryId),
				catalogCardId: uuid(input.catalogCardId),
				role: assertDeckRole(input.role),
				quantity: normalizeQuantity(input.quantity)
			};
			if (normalized.quantity < 1) throw new ValidationError('Quantity must be positive');
			return categoryTransaction(
				db,
				async (tx) => {
					const { accountId } = await auth.requireActor(actor, tx);
					await owned(tx, accountId, normalized.deckId);
					return readCategoryMergePreview(tx, normalized);
				},
				{ isolationLevel: 'repeatable read', accessMode: 'read only' }
			);
		},
		getDeckEntryCategories,
		initializeDeckCategories: (actor, input) =>
			mutate(actor, strict(input, ['deckId', 'requestId']), false),
		setEntryCategory: (actor, input) =>
			mutate(
				actor,
				strict(input, ['deckId', 'entryId', 'categoryId', 'expectedDecisionRevision', 'requestId']),
				true
			)
	};
}
