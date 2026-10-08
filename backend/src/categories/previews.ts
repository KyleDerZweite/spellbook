import { readComboFacts } from "./combo.ts";
import { buildWholePlan } from "./whole-preview.ts";
import { storeWholeCategories } from "./whole.ts";
import type {
  WholeCategory,
  WholeCategoryAcknowledgement,
} from "@spellbook/contracts/whole-categories.ts";
import { advanceDeckLibraryRevision } from "../decks/directory-revision.ts";
import { touchWholeDeckJob } from "./jobs.ts";
import { publishCategoryChange } from "./notification.ts";
import {
  categoryTransaction,
  categoryCheckpoint,
  categoryJson,
} from "./work.ts";
import { sql } from "drizzle-orm";
import type { AuthUser } from "@spellbook/contracts/auth.ts";
import type {
  CategoryAcknowledgement,
  EntryCategoryDecision,
  EntryDefinition,
} from "@spellbook/contracts/categories.ts";
import type {
  CategoryChangeIntent,
  CategoryDifference,
  CategoryPreview,
} from "@spellbook/contracts/category-library.ts";
import type { Database, Transaction } from "../db/client.ts";
import type { createLocalAuth } from "../auth/local.ts";
import {
  mutationFingerprint,
  RequestConflictError,
} from "../decks/request-fingerprint.ts";
import { ValidationError } from "../mtg/validation.ts";
import { CategoryNotFound } from "./errors.ts";
import {
  categoryReceipt,
  categoryUuid,
  LibraryConflict,
  readLibrary,
  storeCategoryReceipt,
  strictCategoryFields,
} from "./library.ts";
import {
  prepareCategoryEvaluation,
  adoptCustomDefinition,
  adoptedDefinitions,
  evaluateCategoryFact,
  readDecisions,
  readEntryCategoryFacts,
  readCategoryComposition,
  comboComposition,
  entryComboDefinitions,
  type CategorySourceTokens,
} from "./persistence.ts";
import { lockOwnedCategoryDeck, originIdentity } from "./changes.ts";
import { starterDefinitions } from "./rules.ts";
export class CategoryPreviewCapacity extends Error {
  readonly kind = "CategoryPreviewCapacity";
  constructor() {
    super(
      "Four Category previews are already open. Retry after one expires or is committed.",
    );
  }
}
export class CategoryPreviewExpired extends Error {
  readonly kind = "CategoryPreviewExpired";
  constructor() {
    super("This preview expired. Request a new preview before committing.");
  }
}
type Plan = {
  wholeCategories?: WholeCategory[];
  definitions: EntryDefinition[];
  decisions: EntryCategoryDecision[];
  suppressed: string[];
  libraryRevision: string;
  decisionRevision: string;
  compositionRevision: string;
  sources: CategorySourceTokens;
  blocked: boolean;
  changed: boolean;
};
type PreviewRow = {
  id: string;
  deck_id: string;
  scope: CategoryChangeIntent["scope"];
  mode: CategoryChangeIntent["mode"];
  expires_at: Date | string;
  plan: Plan | null;
  acknowledgement:
    CategoryAcknowledgement | WholeCategoryAcknowledgement | null;
  difference_total: number;
  blocked: boolean;
  has_plan: boolean;
};
function page(
  row: PreviewRow,
  differences: CategoryDifference[],
  offset = 0,
  limit = 50,
): CategoryPreview {
  const expiresAt = new Date(row.expires_at);
  return {
    id: row.id,
    deckId: row.deck_id,
    scope: row.scope,
    mode: row.mode,
    status: row.acknowledgement
      ? "Committed"
      : Date.now() >= expiresAt.getTime()
        ? "Expired"
        : !row.has_plan
          ? "Expired"
          : row.blocked
            ? "BlockedByNameConflict"
            : "Ready",
    expiresAt: expiresAt.toISOString(),
    total: row.has_plan ? row.difference_total : 0,
    offset,
    limit,
    differences: row.has_plan ? differences : [],
    acknowledgement: row.acknowledgement,
  };
}
const previewColumns = sql`id,deck_id,scope,mode,expires_at,acknowledgement,difference_total,blocked,plan IS NOT NULL AS has_plan`;
async function readPage(
  tx: Transaction,
  row: PreviewRow,
  offset = 0,
  limit = 50,
) {
  const differences = row.has_plan
    ? await tx.execute(
        sql`SELECT difference FROM category_preview_differences WHERE preview_id=${row.id}::uuid AND position>=${offset} ORDER BY position LIMIT ${limit}`,
      )
    : { rows: [] };
  return page(
    row,
    differences.rows.map((r) => r.difference as CategoryDifference),
    offset,
    limit,
  );
}
async function cleanupExpired(tx: Transaction, accountId: string) {
  // Each call progresses through abandoned payloads while preserving identity and receipts.
  await tx.execute(
    sql`WITH batch AS (SELECT d.preview_id,d.position FROM category_change_previews p JOIN category_preview_differences d ON d.preview_id=p.id WHERE p.account_id=${accountId} AND p.plan IS NOT NULL AND p.expires_at<=clock_timestamp() ORDER BY p.expires_at,p.id,d.position LIMIT 1000) DELETE FROM category_preview_differences d USING batch b WHERE d.preview_id=b.preview_id AND d.position=b.position`,
  );
  await tx.execute(
    sql`WITH batch AS (SELECT p.id FROM category_change_previews p WHERE p.account_id=${accountId} AND p.expires_at<=clock_timestamp() AND p.plan IS NOT NULL AND NOT EXISTS(SELECT 1 FROM category_preview_differences d WHERE d.preview_id=p.id) ORDER BY p.expires_at,p.id LIMIT 8) UPDATE category_change_previews p SET plan=NULL FROM batch b WHERE p.id=b.id`,
  );
}
function proposedDefinitions(
  current: EntryDefinition[],
  versions: Awaited<ReturnType<typeof readLibrary>>,
  suppressed: string[],
  manual: EntryCategoryDecision[],
) {
  const byOrigin = new Map(current.map((d) => [originIdentity(d), d])),
    suppressedSet = new Set(suppressed),
    manualIds = new Set(manual.map((m) => m.categoryId));
  const eligible = [
    ...versions.definitions
      .filter((d) => !d.archived && d.current.scope === "entry")
      .map((d) =>
        adoptCustomDefinition(d.current, byOrigin.get(d.originId)?.id),
      ),
    ...starterDefinitions.map((d) => ({
      ...d,
      originId: d.id,
      id: byOrigin.get(d.id)?.id ?? crypto.randomUUID(),
      automaticEligible: true,
    })),
  ].filter((d) => !suppressedSet.has(originIdentity(d)));
  const ids = new Set(eligible.map((d) => d.id));
  const retained = current
    .filter((d) => !ids.has(d.id) && manualIds.has(d.id))
    .map((d) => ({ ...d, automaticEligible: false }));
  return [...eligible, ...retained];
}
function definitionSemantics(definition: EntryDefinition) {
  return {
    ...definition,
    originId: originIdentity(definition),
    automaticEligible: definition.automaticEligible !== false,
  };
}
async function buildPlan(
  tx: Transaction,
  accountId: string,
  intent: CategoryChangeIntent,
): Promise<Plan & { differences: CategoryDifference[] }> {
  const compositionRevision = await lockOwnedCategoryDeck(
    tx,
    accountId,
    intent.deckId,
  );
  const size = await tx.execute(
    sql`SELECT COALESCE((SELECT octet_length(definitions::text) FROM deck_category_bundles WHERE deck_id=${intent.deckId}::uuid),0)+COALESCE((SELECT sum(octet_length(row_to_json(d)::text)) FROM deck_entry_category_decisions d WHERE deck_id=${intent.deckId}::uuid),0)+COALESCE((SELECT count(*)*128 FROM deck_cards WHERE deck_id=${intent.deckId}::uuid),0) AS bytes`,
  );
  categoryCheckpoint(tx, Number(size.rows[0].bytes));
  const current = await adoptedDefinitions(tx, intent.deckId);
  if (!current)
    throw new ValidationError(
      "Initialize deck categories before requesting Review or Reset",
    );
  const bundle = (
    await tx.execute(
      sql`SELECT decision_revision::text,suppressed_origins FROM deck_category_bundles WHERE deck_id=${intent.deckId}::uuid`,
    )
  ).rows[0];
  const oldSuppressed = bundle.suppressed_origins as string[],
    restoreSet = new Set(intent.restoreOriginIds),
    oldSuppressedSet = new Set(oldSuppressed);
  if (intent.restoreOriginIds.some((id) => !oldSuppressedSet.has(id)))
    throw new ValidationError(
      "Only suppressed origins may be explicitly restored",
    );
  const suppressed = oldSuppressed.filter((id) => !restoreSet.has(id));
  const entries = await tx.execute(
    sql`SELECT c.id::text,c.catalog_card_id FROM deck_cards c LEFT JOIN deck_entry_category_decisions d ON d.entry_id=c.id WHERE c.deck_id=${intent.deckId}::uuid AND (c.role='main' OR d.entry_id IS NOT NULL) ORDER BY c.id`,
  );
  const existing = await readDecisions(tx, intent.deckId),
    manual =
      intent.mode === "Review"
        ? existing.filter((d) => d.state === "Manual")
        : [];
  const library = await readLibrary(tx, accountId, true),
    definitions = proposedDefinitions(current, library, suppressed, manual);
  const currentById = new Map(current.map((d) => [d.id, d])),
    definitionIds = new Set(definitions.map((d) => d.id)),
    existingById = new Map(existing.map((d) => [d.entryId, d]));
  const differences: CategoryDifference[] = [],
    names = new Map<string, string>();
  let blocked = false;
  for (const definition of definitions) {
    categoryCheckpoint(tx);
    const name = definition.name.normalize("NFC").toLocaleLowerCase("en");
    if (names.has(name)) {
      blocked = true;
      differences.push({
        kind: "NameConflict",
        entityId: definition.id,
        message: `The name ${definition.name} is used by distinct origins. Rename the retained local category and preview again.`,
        after: definition,
      });
    }
    names.set(name, definition.id);
    const before = currentById.get(definition.id);
    if (!before)
      differences.push({
        kind: "DefinitionAdded",
        entityId: definition.id,
        message: `Adopt ${definition.name}`,
        before: null,
        after: definition,
      });
    else if (
      mutationFingerprint(definitionSemantics(before)) !==
      mutationFingerprint(definitionSemantics(definition))
    )
      differences.push({
        kind: "DefinitionChanged",
        entityId: definition.id,
        message: `Review the adopted definition of ${definition.name}`,
        before,
        after: definition,
      });
    if (definition.automaticEligible === false)
      differences.push({
        kind: "RetainedManual",
        entityId: definition.id,
        message: `Retain historical Manual category ${definition.name}`,
        before,
        after: definition,
      });
  }
  for (const before of current)
    if (!definitionIds.has(before.id))
      differences.push({
        kind: "DefinitionRemoved",
        entityId: before.id,
        message: `Remove ${before.name} from automatic adoption`,
        before,
        after: null,
      });
  for (const id of intent.restoreOriginIds)
    differences.push({
      kind: "OriginRestored",
      entityId: id,
      message: "Explicitly restore this suppressed origin",
    });
  const composition = await readCategoryComposition(tx, intent.deckId);
  const { facts, tokens, comboSource } = await readEntryCategoryFacts(
    tx,
    composition.map((e) => e.printingId),
    definitions,
  );
  const combos = comboSource
    ? await readComboFacts(
        tx,
        comboComposition(composition, facts),
        entryComboDefinitions(definitions),
        comboSource,
      )
    : null;
  const decisions: EntryCategoryDecision[] = [],
    prepared = prepareCategoryEvaluation(definitions);
  for (const entry of entries.rows) {
    categoryCheckpoint(tx);
    const entryId = String(entry.id),
      before = existingById.get(entryId);
    if (before?.state === "Manual" && intent.mode === "Review") {
      differences.push({
        kind: "EntryPreserved",
        entityId: entryId,
        message: "Preserve your Manual choice and its historical meaning.",
        before,
        after: before,
      });
      continue;
    }
    const evaluated = evaluateCategoryFact(
      definitions,
      String(entry.catalog_card_id),
      facts.get(String(entry.catalog_card_id)),
      prepared,
      combos ? { entryId, combos } : undefined,
    );
    const after: EntryCategoryDecision = {
      entryId,
      revision: before?.revision ?? "0",
      ...evaluated,
      previousEvaluation: null,
    };
    const relevant = (d: EntryCategoryDecision | undefined) =>
      d
        ? {
            categoryId: d.categoryId,
            state: d.state,
            evidence: d.evidence,
            definitionSnapshot: d.definitionSnapshot ?? null,
            previousEvaluation: d.previousEvaluation ?? null,
          }
        : null;
    if (
      mutationFingerprint(relevant(before)) !==
      mutationFingerprint(relevant(after))
    ) {
      after.revision = (BigInt(before?.revision ?? "0") + 1n).toString();
      decisions.push(after);
      differences.push({
        kind: "EntryChanged",
        entityId: entryId,
        message:
          after.state === "Pending"
            ? "Missing facts leave this entry Pending"
            : "Apply the reviewed primary category",
        before: before ?? null,
        after,
      });
    }
  }
  differences.sort((a, b) =>
    a.kind < b.kind
      ? -1
      : a.kind > b.kind
        ? 1
        : a.entityId < b.entityId
          ? -1
          : a.entityId > b.entityId
            ? 1
            : 0,
  );
  return {
    definitions,
    decisions,
    suppressed,
    libraryRevision: library.revision,
    decisionRevision: String(bundle.decision_revision),
    compositionRevision,
    sources: tokens,
    differences,
    blocked,
    changed:
      decisions.length > 0 ||
      mutationFingerprint(current.map(definitionSemantics)) !==
        mutationFingerprint(definitions.map(definitionSemantics)) ||
      JSON.stringify(oldSuppressed) !== JSON.stringify(suppressed),
  };
}
export function createCategoryPreviews(
  db: Database,
  auth: Pick<
    ReturnType<typeof createLocalAuth>,
    "requireActor" | "requireActorForWrite"
  >,
) {
  async function accountLock(
    tx: Transaction,
    actor: AuthUser,
    accountId: string,
  ) {
    await tx.execute(
      sql`SELECT account_id FROM user_profiles WHERE account_id=${accountId} FOR UPDATE`,
    );
    await auth.requireActorForWrite(actor, tx);
  }
  return {
    previewCategoryChange: async (
      actor: AuthUser,
      value: CategoryChangeIntent,
    ): Promise<CategoryPreview> => {
      const raw = strictCategoryFields(value, [
        "requestId",
        "deckId",
        "scope",
        "mode",
        "restoreOriginIds",
      ]);
      const requestId = categoryUuid(raw.requestId),
        deckId = categoryUuid(raw.deckId);
      if (
        (raw.scope !== "entry" && raw.scope !== "deck") ||
        (raw.mode !== "Review" && raw.mode !== "Reset")
      )
        throw new ValidationError("Select scope and Review or Reset");
      if (
        !Array.isArray(raw.restoreOriginIds) ||
        raw.restoreOriginIds.length > 1000
      )
        throw new ValidationError("Invalid suppressed-origin selections");
      const restoreOriginIds = raw.restoreOriginIds.map(categoryUuid).sort();
      if (new Set(restoreOriginIds).size !== restoreOriginIds.length)
        throw new ValidationError("Duplicate restoration origin");
      const intent: CategoryChangeIntent = {
          requestId,
          deckId,
          scope: raw.scope,
          mode: raw.mode,
          restoreOriginIds,
        },
        hash = mutationFingerprint(intent);
      return categoryTransaction(db, async (tx) => {
        const { accountId } = await auth.requireActor(actor, tx);
        await accountLock(tx, actor, accountId);
        const old = await tx.execute(
          sql`SELECT ${previewColumns},request_hash FROM category_change_previews WHERE account_id=${accountId} AND request_id=${requestId}::uuid`,
        );
        if (old.rows.length) {
          if (old.rows[0].request_hash !== hash)
            throw new RequestConflictError();
          return readPage(tx, old.rows[0] as PreviewRow);
        }
        await lockOwnedCategoryDeck(tx, accountId, deckId);
        await cleanupExpired(tx, accountId);
        const live = await tx.execute(
          sql`SELECT count(*)::int AS count FROM category_change_previews WHERE account_id=${accountId} AND expires_at>clock_timestamp() AND acknowledgement IS NULL`,
        );
        if (Number(live.rows[0].count) >= 4)
          throw new CategoryPreviewCapacity();
        const complete =
          intent.scope === "deck"
            ? await buildWholePlan(tx, accountId, intent)
            : await buildPlan(tx, accountId, intent);
        categoryJson(tx, complete);
        const { differences, ...plan } = complete,
          id = crypto.randomUUID();
        const result = await tx.execute(
          sql`INSERT INTO category_change_previews(id,account_id,request_id,request_hash,deck_id,scope,mode,expires_at,plan,difference_total,blocked) VALUES(${id}::uuid,${accountId},${requestId}::uuid,${hash},${deckId}::uuid,${intent.scope},${intent.mode},clock_timestamp()+interval '15 minutes',${categoryJson(tx, plan)}::jsonb,${differences.length},${plan.blocked}) RETURNING ${previewColumns}`,
        );
        for (let offset = 0; offset < differences.length; offset += 100) {
          categoryCheckpoint(tx);
          const chunk = differences
            .slice(offset, offset + 100)
            .map((difference, i) => ({ position: offset + i, difference }));
          await tx.execute(
            sql`INSERT INTO category_preview_differences(preview_id,position,difference) SELECT ${id}::uuid,x.position,x.difference FROM jsonb_to_recordset(${categoryJson(tx, chunk)}::jsonb) x(position integer,difference jsonb)`,
          );
        }
        return readPage(tx, result.rows[0] as PreviewRow);
      });
    },
    getCategoryPreview: async (
      actor: AuthUser,
      value: { previewId: string; offset?: number; limit?: number },
    ) => {
      const raw = strictCategoryFields(value, ["previewId", "offset", "limit"]),
        id = categoryUuid(raw.previewId),
        offset = raw.offset ?? 0,
        limit = raw.limit ?? 50;
      if (
        typeof offset !== "number" ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      )
        throw new ValidationError("Invalid preview page");
      return categoryTransaction(
        db,
        async (tx) => {
          const { accountId } = await auth.requireActor(actor, tx);
          const result = await tx.execute(
            sql`SELECT ${previewColumns} FROM category_change_previews WHERE id=${id}::uuid AND account_id=${accountId}`,
          );
          if (!result.rows.length) throw new CategoryNotFound();
          return readPage(tx, result.rows[0] as PreviewRow, offset, limit);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    commitCategoryChange: async (
      actor: AuthUser,
      value: { requestId: string; previewId: string },
    ): Promise<CategoryAcknowledgement | WholeCategoryAcknowledgement> => {
      const raw = strictCategoryFields(value, ["requestId", "previewId"]),
        requestId = categoryUuid(raw.requestId),
        previewId = categoryUuid(raw.previewId),
        hash = mutationFingerprint({
          kind: "category.preview.commit",
          previewId,
        });
      return categoryTransaction(db, async (tx) => {
        const { accountId } = await auth.requireActor(actor, tx);
        await accountLock(tx, actor, accountId);
        const replay = await categoryReceipt(tx, accountId, requestId, hash);
        if (replay)
          return replay as
            CategoryAcknowledgement | WholeCategoryAcknowledgement;
        const lookup = await tx.execute(
          sql`SELECT ${previewColumns} FROM category_change_previews WHERE id=${previewId}::uuid AND account_id=${accountId}`,
        );
        if (!lookup.rows.length) throw new CategoryNotFound();
        const candidate = lookup.rows[0] as PreviewRow;
        if (candidate.acknowledgement) {
          await storeCategoryReceipt(
            tx,
            accountId,
            requestId,
            hash,
            candidate.acknowledgement,
          );
          return candidate.acknowledgement;
        }
        const compositionRevision = await lockOwnedCategoryDeck(
          tx,
          accountId,
          candidate.deck_id,
        );
        const result = await tx.execute(
          sql`SELECT * FROM category_change_previews WHERE id=${previewId}::uuid AND account_id=${accountId} FOR UPDATE`,
        );
        if (!result.rows.length) throw new CategoryNotFound();
        const row = result.rows[0] as PreviewRow;
        const clock = await tx.execute(
          sql`SELECT clock_timestamp()>=${row.expires_at}::timestamptz AS expired`,
        );
        if (clock.rows[0].expired || !row.plan)
          throw new CategoryPreviewExpired();
        const plan = row.plan;
        if (plan.blocked) throw new LibraryConflict();
        const library = (
            await tx.execute(
              sql`SELECT revision::text FROM category_library_state WHERE account_id=${accountId}`,
            )
          ).rows[0],
          bundle = (
            await tx.execute(
              sql`SELECT decision_revision::text FROM deck_category_bundles WHERE deck_id=${row.deck_id}::uuid`,
            )
          ).rows[0];
        if (
          !bundle ||
          compositionRevision !== plan.compositionRevision ||
          String(library?.revision ?? "0") !== plan.libraryRevision ||
          String(bundle.decision_revision) !== plan.decisionRevision
        )
          throw new LibraryConflict();
        await tx.execute(
          sql`SELECT id FROM catalog_state WHERE id=1 FOR SHARE`,
        );
        await tx.execute(
          sql`SELECT id FROM oracle_tag_state WHERE id=1 FOR SHARE`,
        );
        const { tokens } = await readEntryCategoryFacts(
          tx,
          [],
          plan.definitions,
          row.scope === "deck"
            ? plan.wholeCategories
                ?.filter(
                  (c) =>
                    !c.suppressed &&
                    c.automaticActive &&
                    c.decision?.state !== "Manual",
                )
                .map((c) => ({
                  id: c.versionId,
                  roles: c.definition.roles,
                  rule: c.definition.rule,
                }))
            : undefined,
        );
        if (mutationFingerprint(tokens) !== mutationFingerprint(plan.sources))
          throw new LibraryConflict();
        if (row.scope === "deck") {
          if (!plan.wholeCategories) throw new CategoryPreviewExpired();
          if (plan.changed) {
            await storeWholeCategories(tx, row.deck_id, plan.wholeCategories);
            await tx.execute(
              sql`UPDATE deck_category_bundles SET whole_deck_definitions=${categoryJson(
                tx,
                plan.wholeCategories
                  .filter((c) => !c.suppressed)
                  .map((c) => c.definition),
              )}::jsonb,library_revision=${plan.libraryRevision}::bigint,decision_revision=decision_revision+1 WHERE deck_id=${row.deck_id}::uuid`,
            );
            await touchWholeDeckJob(tx, row.deck_id);
            await advanceDeckLibraryRevision(tx, accountId);
            await publishCategoryChange(tx, accountId);
          }
          const ack: WholeCategoryAcknowledgement = {
            requestId,
            deckId: row.deck_id,
            scope: "deck",
            decisionRevision: plan.changed
              ? (BigInt(plan.decisionRevision) + 1n).toString()
              : plan.decisionRevision,
            versionIds: plan.wholeCategories.map((c) => c.versionId),
            changed: plan.changed,
          };
          await storeCategoryReceipt(tx, accountId, requestId, hash, ack);
          await tx.execute(
            sql`UPDATE category_change_previews SET acknowledgement=${JSON.stringify(ack)}::jsonb WHERE id=${previewId}::uuid`,
          );
          return ack;
        }
        const ordered = [...plan.decisions].sort((a, b) =>
          a.entryId < b.entryId ? -1 : 1,
        );
        for (let offset = 0; offset < ordered.length; offset += 100) {
          categoryCheckpoint(tx);
          await tx.execute(sql`INSERT INTO deck_entry_category_decisions(entry_id,deck_id,category_id,state,revision,evidence,definition_snapshot,previous_evaluation)
					SELECT x."entryId",${row.deck_id}::uuid,x."categoryId",x.state,x.revision,x.evidence,x."definitionSnapshot",NULL
					FROM jsonb_to_recordset(${categoryJson(tx, ordered.slice(offset, offset + 100))}::jsonb) AS x("entryId" uuid,"categoryId" uuid,state text,revision bigint,evidence jsonb,"definitionSnapshot" jsonb)
					ORDER BY x."entryId" ON CONFLICT(entry_id) DO UPDATE SET category_id=EXCLUDED.category_id,state=EXCLUDED.state,revision=EXCLUDED.revision,evidence=EXCLUDED.evidence,definition_snapshot=EXCLUDED.definition_snapshot,previous_evaluation=NULL`);
        }

        if (plan.changed)
          await tx.execute(
            sql`UPDATE deck_category_bundles SET definitions=${JSON.stringify(plan.definitions)}::jsonb,suppressed_origins=${"{" + plan.suppressed.join(",") + "}"}::uuid[],library_revision=${plan.libraryRevision}::bigint,decision_revision=decision_revision+1 WHERE deck_id=${row.deck_id}::uuid`,
          );
        const ack: CategoryAcknowledgement = {
          requestId,
          deckId: row.deck_id,
          decisionRevision: plan.changed
            ? (BigInt(plan.decisionRevision) + 1n).toString()
            : plan.decisionRevision,
          entryIds: plan.decisions.map((d) => d.entryId),
        };
        await storeCategoryReceipt(tx, accountId, requestId, hash, ack);
        await tx.execute(
          sql`UPDATE category_change_previews SET acknowledgement=${JSON.stringify(ack)}::jsonb WHERE id=${previewId}::uuid`,
        );
        if (plan.changed) {
          await touchWholeDeckJob(tx, row.deck_id);
          await publishCategoryChange(tx, accountId);
        }
        return ack;
      });
    },
  };
}
