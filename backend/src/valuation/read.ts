import { referenceOrigin } from "./origin.ts";
import type { Pool, PoolClient } from "pg";
import type { createLocalAuth } from "../auth/local.ts";
import type { AuthUser } from "@spellbook/contracts/auth.ts";
import { isReferenceDecimal } from "@spellbook/contracts/valuation.ts";
import type {
  InventoryPriceResponse,
  PriceFinish,
  PriceHistoryResponse,
  PriceHistoryPoint,
  PriceSource,
  PricePublication,
  PriceReference,
  PriceRequest,
  PriceResponse,
  PriceUnknownReason,
  ProductLink,
  ValuationApplication,
} from "@spellbook/contracts/valuation.ts";
import { ValidationError } from "../mtg/validation.ts";
import { databaseInteger } from "../db/numbers.ts";
import { readOptionalReferences } from "./optional.ts";
export class PriceReadUnavailable extends Error {
  readonly kind = "PriceReadUnavailable";
  constructor() {
    super("Reference prices are temporarily unavailable.");
  }
}
export class InventoryPriceNotFound extends Error {
  readonly kind = "InventoryPriceNotFound";
  constructor() {
    super("Inventory entry not found.");
  }
}
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function uuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new ValidationError("Invalid printing or entry UUID");
  return value.toLowerCase();
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new ValidationError("Unsupported price request fields");
  return value as Record<string, unknown>;
}
function requests(input: unknown): PriceRequest[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100)
    throw new ValidationError("Supply 1 to 100 price requests");
  const normalized = input.map((value) => {
    const v = object(value, ["printingId", "finish"]);
    if (v.finish !== "nonfoil" && v.finish !== "foil")
      throw new ValidationError("Invalid finish");
    return { printingId: uuid(v.printingId), finish: v.finish } as PriceRequest;
  });
  if (
    new Set(normalized.map((v) => v.printingId + v.finish)).size !==
    normalized.length
  )
    throw new ValidationError("Duplicate price request");
  return normalized;
}
function entryIds(input: unknown): string[] {
  const value = object(input, ["entryIds"]);
  if (
    !Array.isArray(value.entryIds) ||
    value.entryIds.length < 1 ||
    value.entryIds.length > 100
  )
    throw new ValidationError("Supply 1 to 100 entry IDs");
  const ids = value.entryIds.map(uuid);
  if (new Set(ids).size !== ids.length)
    throw new ValidationError("Duplicate entry ID");
  return ids;
}
function decimal(value: string) {
  if (!isReferenceDecimal(value)) throw new PriceReadUnavailable();
  const [whole, raw = ""] = value.split(".");
  const fraction = raw.replace(/0+$/, "");
  return (
    (whole.replace(/^0+(?=\d)/, "") || "0") + (fraction ? "." + fraction : "")
  );
}
export interface ReferenceExecutor {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}
export type FrozenSourceSelection = {
  source: PriceSource;
  enabled: boolean;
  publication: PricePublication | null;
  descriptor: Record<string, unknown> | null;
  selection: Record<string, unknown> | null;
};
export type FrozenReferenceOutcome = {
  reference: PriceReference;
  evaluatedAt: string;
  publication: PricePublication | null;
  descriptor: Record<string, unknown> | null;
  selection: Row | null;
  known: FrozenReferenceEvidence | null;
  sourceSelections: FrozenSourceSelection[];
};
export type FrozenReferenceEvidence = {
  reference: Extract<PriceReference, { kind: "Known" }>;
  publication: PricePublication;
  descriptor: Record<string, unknown>;
  requestedIdentity: Record<string, unknown>;
  matchedIdentity: Record<string, unknown>;
  mappingVersion: number;
  rawValue: string | null;
};
export function freezeReferenceEvidence(
  evidence: FrozenReferenceEvidence,
): FrozenReferenceEvidence {
  return structuredClone(evidence);
}
type Row = {
  printing_id: string | null;
  identity: Record<string, unknown> | null;
  links: Omit<ProductLink, "printingId" | "provenance">[] | null;
  supported: boolean | null;
  amount: string | null;
  measure: "prices.eur" | "prices.eur_foil";
  raw_value: string | null;
  english_printing_id: string | null;
  english_variant_key: string | null;
  english_identity: Record<string, unknown> | null;
  english_links: Omit<ProductLink, "printingId" | "provenance">[] | null;
  english_amount: string | null;
  english_supported: boolean | null;
  english_raw_value: string | null;
  mapping_reason: PriceUnknownReason | null;
};
function choose(
  request: PriceRequest,
  row: Row | undefined,
  publication: PricePublication | undefined,
  now: Date,
): PriceReference {
  const links: ProductLink[] = (row?.links ?? []).map((link) => ({
    provider: link.provider,
    url: link.url,
    printingId: request.printingId,
    provenance: "Exact",
  }));
  if (row?.english_printing_id)
    for (const link of row.english_links ?? [])
      if (!links.some((l) => l.provider === link.provider))
        links.push({
          provider: link.provider,
          url: link.url,
          printingId: row.english_printing_id,
          provenance: "EnglishFallback",
        });
  const unknown = (reason: PriceUnknownReason): PriceReference => ({
    ...request,
    links,
    kind: "Unknown",
    reason,
  });
  if (!publication) return unknown("SourceUnavailable");
  if (
    publication.timePrecision !== "Instant" ||
    publication.source !== "Scryfall"
  )
    throw new PriceReadUnavailable();
  if (!row?.printing_id) return unknown("PrintingMissing");
  if (!row.supported) return unknown("UnsupportedFinish");
  const age = Math.max(0, now.getTime() - Date.parse(publication.sourceTime));
  if (age > 7 * 86400000) return unknown("ReferenceExpired");
  let amount = row.amount,
    matchedPrintingId = request.printingId,
    provenance: "Exact" | "EnglishFallback" = "Exact";
  if (amount === null && row.english_printing_id && row.english_supported) {
    amount = row.english_amount;
    matchedPrintingId = row.english_printing_id;
    provenance = "EnglishFallback";
  }
  if (amount === null)
    return unknown(
      row.identity?.lang === "en"
        ? "AmountMissing"
        : (row.mapping_reason ?? "AmountMissing"),
    );
  return {
    ...request,
    links,
    kind: "Known",
    amount: decimal(amount),
    currency: "EUR",
    source: "Scryfall",
    measure: row.measure,
    sourceTime: publication.sourceTime,
    timePrecision: "Instant",
    freshness: age <= 86400000 ? "Fresh" : "Stale",
    publicationId: publication.id,
    observationId: [
      publication.id,
      matchedPrintingId,
      request.finish,
      row.measure,
    ].join(":"),
    matchedPrintingId,
    matchedFinish: request.finish,
    provenance,
  };
}
export function createValuation(
  pool: Pool,
  auth: Pick<ReturnType<typeof createLocalAuth>, "requireActor">,
  clock: () => Date = () => new Date(),
): ValuationApplication & {
  freezePrintingReferences(
    input: unknown,
  ): Promise<{ response: PriceResponse; evidence: FrozenReferenceEvidence[] }>;
  freezeInTransaction(
    executor: ReferenceExecutor,
    input: unknown,
    asOf: Date,
  ): Promise<{ response: PriceResponse; evidence: FrozenReferenceOutcome[] }>;
} {
  async function snapshot<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (
        cause instanceof ValidationError ||
        cause instanceof InventoryPriceNotFound
      )
        throw cause;
      throw new PriceReadUnavailable();
    } finally {
      client?.release();
    }
  }
  async function read(
    client: ReferenceExecutor,
    pairs: PriceRequest[],
    frozen?: FrozenReferenceEvidence[],
    evaluation?: Date,
    outcomes?: FrozenReferenceOutcome[],
  ): Promise<PriceResponse> {
    const now = evaluation ?? clock();
    const state = await client.query<{
      publication_id: string | null;
      descriptor: Record<string, unknown>;
      source_type: string;
      source_updated_at: Date;
      payload_digest: string;
      extractor_version: number;
      mapping_version: number;
      ingested_at: Date;
      refresh_status: { kind?: string; attemptedAt?: string } | null;
    }>(
      `SELECT s.refresh_status,p.*,p.id AS publication_id FROM price_state s LEFT JOIN price_publications p ON p.id=s.active_publication WHERE s.id=1`,
    );
    const raw = state.rows[0];
    const publication: PricePublication | undefined = raw?.publication_id
      ? {
          id: raw.publication_id,
          source: "Scryfall",
          bulkType: raw.source_type,
          sourceTime: raw.source_updated_at.toISOString(),
          timePrecision: "Instant",
          payloadDigest: raw.payload_digest,
          extractorVersion: raw.extractor_version,
          mappingVersion: raw.mapping_version,
          ingestedAt: raw.ingested_at.toISOString(),
        }
      : undefined;
    const rows = publication
      ? (
          await client.query<Row>(
            `SELECT p.id AS printing_id,p.identity,p.links,o.supported,o.amount::text,o.measure,o.raw_value,o.english_printing_id,o.mapping_reason,e.variant_key AS english_variant_key,e.identity AS english_identity,e.links AS english_links,eo.amount::text AS english_amount,eo.supported AS english_supported,eo.raw_value AS english_raw_value FROM unnest($2::uuid[],$3::text[]) WITH ORDINALITY r(id,finish,ordinality) LEFT JOIN price_printings p ON p.publication_id=$1 AND p.id=r.id LEFT JOIN price_observations o ON o.publication_id=$1 AND o.printing_id=p.id AND o.finish=r.finish LEFT JOIN price_printings e ON e.publication_id=$1 AND e.id=o.english_printing_id LEFT JOIN price_observations eo ON eo.publication_id=$1 AND eo.printing_id=e.id AND eo.finish=r.finish ORDER BY r.ordinality`,
            [
              publication.id,
              pairs.map((p) => p.printingId),
              pairs.map((p) => p.finish),
            ],
          )
        ).rows
      : [];
    for (const row of rows)
      if (
        (row.amount !== null && !isReferenceDecimal(row.amount)) ||
        (row.english_amount !== null && !isReferenceDecimal(row.english_amount))
      )
        throw new PriceReadUnavailable();
    const baseline = pairs.map((request, index) =>
      choose(request, rows[index], publication, now),
    );
    const evidence = new Map<number, FrozenReferenceEvidence>();
    if (publication)
      baseline.forEach((reference, index) => {
        if (reference.kind !== "Known") return;
        const row = rows[index];
        evidence.set(index, {
          reference,
          publication,
          descriptor: raw.descriptor,
          requestedIdentity: row.identity!,
          matchedIdentity:
            reference.provenance === "Exact"
              ? row.identity!
              : row.english_identity!,
          mappingVersion: publication.mappingVersion,
          rawValue:
            reference.provenance === "Exact"
              ? row.raw_value
              : row.english_raw_value,
        });
      });
    const optional = await readOptionalReferences(client, pairs, now, baseline);
    const priority = { Cardmarket: 0, Scryfall: 1, MTGJSON: 2 };
    const results = baseline.map((reference, index) => {
      const candidates = [
        { reference, evidence: evidence.get(index) },
        ...optional.candidates[index],
      ];
      const known = candidates.filter(
        (candidate) => candidate.reference.kind === "Known",
      );
      known.sort((a, b) => {
        if (a.reference.kind !== "Known" || b.reference.kind !== "Known")
          return 0;
        return (
          Number(a.reference.freshness === "Stale") -
            Number(b.reference.freshness === "Stale") ||
          priority[a.reference.source] - priority[b.reference.source]
        );
      });
      const selected = known[0];
      if (selected?.evidence && frozen)
        frozen.push(freezeReferenceEvidence(selected.evidence));
      if (selected) return selected.reference;
      // Prefer an evaluated printing-specific reason over absent sources.
      return (
        candidates.find(
          (candidate) =>
            candidate.reference.kind === "Unknown" &&
            candidate.reference.reason !== "SourceUnavailable" &&
            candidate.reference.reason !== "PrintingMissing",
        )?.reference ?? reference
      );
    });
    if (outcomes)
      results.forEach((reference, index) => {
        const known =
          frozen?.find(
            (e) =>
              e.reference.printingId === reference.printingId &&
              e.reference.finish === reference.finish,
          ) ?? null;
        outcomes.push(
          structuredClone({
            reference,
            evaluatedAt: now.toISOString(),
            publication: known?.publication ?? publication ?? null,
            descriptor: known?.descriptor ?? raw?.descriptor ?? null,
            selection: rows[index] ?? null,
            known,
            sourceSelections: [
              {
                source: "Scryfall",
                enabled: true,
                publication: publication ?? null,
                descriptor: raw?.descriptor ?? null,
                selection: rows[index] ?? null,
              },
              ...optional.selections[index],
            ],
          }),
        );
      });

    const status = raw?.refresh_status;
    return {
      evaluatedAt: now.toISOString(),
      publications: [
        ...(publication ? [publication] : []),
        ...optional.publications,
      ],
      sourceStatuses: [
        {
          source: "Scryfall",
          enabled: true,
          kind:
            status?.kind === "Failed"
              ? "Failed"
              : status?.kind === "Succeeded"
                ? "Succeeded"
                : "NeverAttempted",
          ...(typeof status?.attemptedAt === "string"
            ? { attemptedAt: status.attemptedAt }
            : {}),
          ...(publication
            ? { lastSuccessfulPublicationId: publication.id }
            : {}),
        },
        ...optional.statuses,
      ],
      refreshStatus: {
        kind:
          status?.kind === "Succeeded"
            ? "Succeeded"
            : status?.kind === "Failed"
              ? "Failed"
              : "NeverAttempted",
        ...(typeof status?.attemptedAt === "string"
          ? { attemptedAt: status.attemptedAt }
          : {}),
      },
      results,
    };
  }
  async function printingReferences(input: unknown) {
    const pairs = requests(input);
    return snapshot((client) => read(client, pairs));
  }
  async function printingHistory(
    input: unknown,
  ): Promise<PriceHistoryResponse> {
    const value = object(input, ["printingId", "finish", "days", "sources"]);
    const pair = requests([
      { printingId: value.printingId, finish: value.finish },
    ])[0];
    const days = value.days === undefined ? 30 : value.days;
    if (
      typeof days !== "number" ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 90
    )
      throw new ValidationError("History days must be 1 to 90");
    const selected = value.sources;
    if (
      selected !== undefined &&
      (!Array.isArray(selected) ||
        selected.length < 1 ||
        selected.length > 3 ||
        selected.some(
          (source) => !["Scryfall", "Cardmarket", "MTGJSON"].includes(source),
        ) ||
        new Set(selected).size !== selected.length)
    )
      throw new ValidationError("Supply 1 to 3 distinct history sources");
    return snapshot(async (client) => {
      const now = clock(),
        to = now.toISOString().slice(0, 10),
        from = new Date(Date.parse(to + "T00:00:00Z") - (days - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
      const outcomes: FrozenReferenceOutcome[] = [];
      const current = await read(client, [pair], undefined, now, outcomes);
      const sources = current.sourceStatuses
        .filter(
          (status) =>
            status.enabled &&
            (selected === undefined || selected.includes(status.source)),
        )
        .map((status) => status.source);
      const mappings = sources.map((source) => {
        const row = outcomes[0].sourceSelections.find(
          (selection) => selection.source === source,
        )?.selection;
        return row?.supported &&
          row.english_supported &&
          typeof row.english_printing_id === "string" &&
          typeof row.english_variant_key === "string"
          ? { id: row.english_printing_id, key: row.english_variant_key }
          : { id: null, key: null };
      });
      const ids = [
        ...new Set([
          pair.printingId,
          ...mappings.flatMap((mapping) => (mapping.id ? [mapping.id] : [])),
        ]),
      ];
      const rows = (
        await client.query(
          `SELECT DISTINCT ON (h.source,h.day) h.source,h.printing_id,h.finish,h.day::text,h.time_precision,h.source_instant,h.amount::text,h.measure,h.provider_id,h.publication_id,jsonb_build_object('publication',hp.evidence,'identity',hi.identity,'variantKey',hi.variant_key) AS evidence FROM price_source_history h JOIN unnest($5::text[],$7::uuid[],$8::text[]) m(source,english_id,variant_key) ON m.source=h.source LEFT JOIN price_history_publications hp ON hp.publication_id=h.publication_id AND hp.source=h.source LEFT JOIN price_history_printings hi ON hi.publication_id=h.publication_id AND hi.printing_id=h.printing_id WHERE h.printing_id=ANY($1::uuid[]) AND h.finish=$2 AND h.day BETWEEN $3::date AND $4::date AND h.source=ANY($5::text[]) AND (h.printing_id=$6 OR (h.printing_id=m.english_id AND hi.variant_key=m.variant_key)) ORDER BY h.source,h.day,(h.printing_id=$6) DESC`,
          [
            ids,
            pair.finish,
            from,
            to,
            sources,
            pair.printingId,
            mappings.map((mapping) => mapping.id),
            mappings.map((mapping) => mapping.key),
          ],
        )
      ).rows;
      if (rows.length > days * sources.length || rows.length > 270)
        throw new PriceReadUnavailable();
      const publications = new Map<string, PricePublication>();
      const points: PriceHistoryPoint[] = rows.map((row) => {
        const source = row.source as PriceSource,
          saved = row.evidence?.publication;
        if (
          !saved ||
          !sources.includes(source) ||
          !isReferenceDecimal(row.amount)
        )
          throw new PriceReadUnavailable();
        const time =
          row.time_precision === "Instant"
            ? {
                timePrecision: "Instant" as const,
                sourceTime: row.source_instant.toISOString(),
              }
            : row.time_precision === "Day"
              ? { timePrecision: "Day" as const, sourceDate: row.day }
              : undefined;
        if (!time) throw new PriceReadUnavailable();
        const origin = referenceOrigin(source, pair.finish, row.provider_id);
        if (row.measure !== origin.measure) throw new PriceReadUnavailable();
        const artifact =
          saved.pointArtifact ??
          (source === "Scryfall"
            ? "ScryfallBulk"
            : source === "Cardmarket"
              ? "CardmarketGuide"
              : "AllPrices");
        const pointDigest =
          saved.pointPayloadDigest ??
          (source === "MTGJSON"
            ? saved.descriptor?.history?.digest
            : saved.payloadDigest);
        if (
          !["ScryfallBulk", "CardmarketGuide", "AllPrices"].includes(
            artifact,
          ) ||
          typeof pointDigest !== "string"
        )
          throw new PriceReadUnavailable();
        publications.set(row.publication_id, {
          id: row.publication_id,
          source,
          bulkType:
            source === "Scryfall"
              ? saved.descriptor.bulkType
              : source === "Cardmarket"
                ? "public-price-guide"
                : "AllPricesToday",
          payloadDigest: saved.payloadDigest,
          extractorVersion: saved.extractorVersion,
          mappingVersion: saved.mappingVersion,
          ingestedAt: saved.ingestedAt,
          ...(source === "MTGJSON"
            ? { timePrecision: "Day", sourceDate: saved.descriptor.sourceDate }
            : {
                timePrecision: "Instant",
                sourceTime:
                  time.timePrecision === "Instant"
                    ? time.sourceTime
                    : saved.descriptor.sourceTime,
              }),
        });
        return {
          ...pair,
          ...origin,
          ...time,
          day: row.day,
          amount: decimal(row.amount),
          currency: "EUR",
          publicationId: row.publication_id,
          observationId: [
            row.publication_id,
            row.printing_id,
            pair.finish,
            row.measure,
            row.day,
          ].join(":"),
          matchedPrintingId: row.printing_id,
          matchedFinish: pair.finish,
          provenance:
            row.printing_id === pair.printingId ? "Exact" : "EnglishFallback",
          mappingVersion: saved.mappingVersion,
          pointArtifact: artifact,
          pointPayloadDigest: pointDigest,
        };
      });
      points.sort(
        (a, b) =>
          a.day.localeCompare(b.day) || a.source.localeCompare(b.source),
      );
      return {
        asOf: now.toISOString(),
        window: { from, to, days },
        sourceStatuses: current.sourceStatuses,
        publications: [...publications.values()],
        points,
      };
    });
  }
  async function inventoryReferences(
    actor: AuthUser,
    input: unknown,
  ): Promise<InventoryPriceResponse> {
    let accountId: string;
    try {
      ({ accountId } = await auth.requireActor(actor));
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        "kind" in cause &&
        cause.kind === "Unauthenticated"
      )
        throw cause;
      throw new PriceReadUnavailable();
    }
    const ids = entryIds(input);
    return snapshot(async (client) => {
      const { rows } = await client.query<{
        id: string;
        catalog_card_id: string;
        finish: PriceFinish;
        quantity: number;
      }>(
        `SELECT id,catalog_card_id,finish,quantity FROM inventory_cards WHERE id=ANY($1::uuid[]) AND account_id=$2 AND game='mtg'`,
        [ids, accountId],
      );
      if (rows.length !== ids.length) throw new InventoryPriceNotFound();
      const ordered = ids.map((id) => rows.find((row) => row.id === id)!);
      const pairs = ordered.map((row) => {
        try {
          if (row.finish !== "nonfoil" && row.finish !== "foil")
            throw new PriceReadUnavailable();
          return { printingId: uuid(row.catalog_card_id), finish: row.finish };
        } catch {
          throw new PriceReadUnavailable();
        }
      });
      const response = await read(client, pairs);
      const coverage = {
        coveredQuantity: 0,
        staleQuantity: 0,
        unknownQuantity: 0,
      };
      const results = ordered.map((row, index) => {
        const reference = response.results[index],
          quantity = databaseInteger(row.quantity);
        if (quantity < 0) throw new PriceReadUnavailable();
        if (reference.kind === "Known") {
          coverage.coveredQuantity = databaseInteger(
            BigInt(coverage.coveredQuantity) + BigInt(quantity),
          );
          if (reference.freshness === "Stale")
            coverage.staleQuantity = databaseInteger(
              BigInt(coverage.staleQuantity) + BigInt(quantity),
            );
        } else
          coverage.unknownQuantity = databaseInteger(
            BigInt(coverage.unknownQuantity) + BigInt(quantity),
          );
        return { entryId: row.id, quantity, reference };
      });
      return { ...response, results, coverage };
    });
  }
  async function freezePrintingReferences(input: unknown) {
    const pairs = requests(input);
    return snapshot(async (client) => {
      const evidence: FrozenReferenceEvidence[] = [];
      const response = await read(client, pairs, evidence);
      return { response, evidence };
    });
  }
  async function freezeInTransaction(
    executor: ReferenceExecutor,
    input: unknown,
    asOf: Date,
  ) {
    const pairs = requests(input),
      known: FrozenReferenceEvidence[] = [],
      evidence: FrozenReferenceOutcome[] = [];
    if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime()))
      throw new ValidationError("Invalid reference evaluation instant");
    try {
      const response = await read(executor, pairs, known, asOf, evidence);
      return { response, evidence };
    } catch (cause) {
      if (cause instanceof ValidationError) throw cause;
      throw new PriceReadUnavailable();
    }
  }

  return {
    printingReferences,
    printingHistory,
    inventoryReferences,
    freezePrintingReferences,
    freezeInTransaction,
  };
}
