import { sql } from "drizzle-orm";
import type { InventoryAcknowledgement } from "@spellbook/contracts/inventory.ts";
import type { ProfileCardDefinition } from "@spellbook/contracts/profile.ts";
import {
  bigint,
  check,
  boolean,
  date,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  numeric,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const decimalRevision = customType<{ data: string; driverData: string }>({
  dataType() {
    return "bigint";
  },
  fromDriver(value) {
    return String(value);
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const userProfiles = pgTable("user_profiles", {
  accountId: text("account_id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull().default(""),
  avatarId: text("avatar_id").notNull().default("wizard"),
  artworkId: text("artwork_id").notNull().default("grove"),
  profileCard: jsonb("profile_card").$type<ProfileCardDefinition>(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const localCredentials = pgTable("local_credentials", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => userProfiles.accountId, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("auth_sessions_account_idx").on(table.accountId)],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    providerType: text("provider_type").notNull(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    emailAtLogin: text("email_at_login").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_idx").on(
      table.providerType,
      table.issuer,
      table.subject,
    ),
    index("auth_identities_account_idx").on(table.accountId),
  ],
);

export const inventories = pgTable(
  "inventories",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    game: text("game").notNull(),
    revision: decimalRevision("revision").notNull().default("0"),
    ...timestamps,
  },
  (table) => [
    check("inventories_game_check", sql`${table.game} in ('mtg')`),
    uniqueIndex("inventories_account_game_idx").on(table.accountId, table.game),
  ],
);

export const inventoryCards = pgTable(
  "inventory_cards",
  {
    id: uuid("id").primaryKey(),
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => inventories.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    game: text("game").notNull(),
    catalogCardId: text("catalog_card_id").notNull(),
    canonicalCardId: text("canonical_card_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    imageUri: text("image_uri").notNull(),
    quantity: integer("quantity").notNull(),
    finish: text("finish").notNull(),
    condition: text("condition").notNull(),
    notes: text("notes").notNull().default(""),
    notesRevision: decimalRevision("notes_revision").notNull().default("0"),
    spellbookPosition: integer("spellbook_position").notNull(),
    ...timestamps,
  },
  (table) => [
    check("inventory_cards_quantity_check", sql`${table.quantity} > 0`),
    check(
      "inventory_cards_spellbook_position_check",
      sql`${table.spellbookPosition} >= 0`,
    ),
    check(
      "inventory_cards_finish_check",
      sql`${table.finish} in ('nonfoil', 'foil')`,
    ),
    check(
      "inventory_cards_condition_check",
      sql`${table.condition} in ('NM', 'LP', 'MP', 'HP', 'DMG')`,
    ),
    uniqueIndex("inventory_cards_unique_printing_idx").on(
      table.inventoryId,
      table.catalogCardId,
      table.finish,
      table.condition,
    ),
    index("inventory_cards_account_game_idx").on(table.accountId, table.game),
    index("inventory_cards_inventory_position_idx").on(
      table.inventoryId,
      table.spellbookPosition,
    ),
    index("inventory_cards_canonical_card_idx").on(table.canonicalCardId),
    index("inventory_cards_window_name_idx").on(
      table.inventoryId,
      sql`${table.name} COLLATE "inventory_root"`,
      sql`${table.setCode} COLLATE "inventory_root"`,
    ),
  ],
);

export const inventoryGroups = pgTable(
  "inventory_groups",
  {
    id: uuid("id").primaryKey(),
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => inventories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "inventory_groups_name_check",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) between 1 and 64`,
    ),
    uniqueIndex("inventory_groups_inventory_name_idx").on(
      table.inventoryId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const inventoryGroupMemberships = pgTable(
  "inventory_group_memberships",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => inventoryGroups.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => inventoryCards.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.entryId] }),
    index("inventory_group_memberships_entry_idx").on(table.entryId),
  ],
);

export const decks = pgTable(
  "decks",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    game: text("game").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    descriptionRevision: bigint("description_revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    compositionRevision: bigint("composition_revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    format: text("format").notNull().default("Commander"),
    ...timestamps,
  },
  (table) => [
    check("decks_game_check", sql`${table.game} in ('mtg')`),
    index("decks_account_game_updated_idx").on(
      table.accountId,
      table.game,
      table.updatedAt,
    ),
  ],
);

export const deckCards = pgTable(
  "deck_cards",
  {
    id: uuid("id").primaryKey(),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    game: text("game").notNull(),
    catalogCardId: text("catalog_card_id").notNull(),
    canonicalCardId: text("canonical_card_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    imageUri: text("image_uri").notNull(),
    quantity: integer("quantity").notNull(),
    role: text("role").notNull().default("main"),
    ...timestamps,
  },
  (table) => [
    check("deck_cards_quantity_check", sql`${table.quantity} > 0`),
    check(
      "deck_cards_role_check",
      sql`${table.role} in ('main', 'sideboard', 'commander', 'companion')`,
    ),
    check("deck_cards_game_check", sql`${table.game} in ('mtg')`),
    uniqueIndex("deck_cards_unique_card_role_idx").on(
      table.deckId,
      table.catalogCardId,
      table.role,
    ),
    index("deck_cards_account_game_idx").on(table.accountId, table.game),
    index("deck_cards_deck_idx").on(table.deckId),
  ],
);

export const deckMutationRequests = pgTable(
  "deck_mutation_requests",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    requestHash: text("request_hash"),
    deckId: uuid("deck_id").notNull(),
    acknowledgement:
      jsonb("acknowledgement").$type<
        import("@spellbook/contracts/decks.ts").DeckAcknowledgement
      >(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.requestId] }),
    check(
      "deck_mutation_requests_source_check",
      sql`${table.source} in ('mobile', 'web', 'import')`,
    ),
    check(
      "deck_mutation_requests_status_check",
      sql`${table.status} in ('applied', 'pending', 'rejected')`,
    ),
  ],
);

export const scanSessions = pgTable(
  "scan_sessions",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    game: text("game").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    check("scan_sessions_game_check", sql`${table.game} in ('mtg')`),
    check(
      "scan_sessions_status_check",
      sql`${table.status} in ('open', 'pending_review', 'committed', 'cancelled')`,
    ),
    index("scan_sessions_account_game_updated_idx").on(
      table.accountId,
      table.game,
      table.updatedAt,
    ),
  ],
);

export const scanArtifacts = pgTable(
  "scan_artifacts",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => scanSessions.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    originalObjectKey: text("original_object_key").notNull(),
    normalizedObjectKey: text("normalized_object_key").notNull(),
    qualityScore: integer("quality_score").notNull(),
    embeddingModelVersion: text("embedding_model_version").notNull(),
    ocrModelVersion: text("ocr_model_version").notNull(),
    status: text("status").notNull(),
    ocrName: text("ocr_name"),
    ocrSetCode: text("ocr_set_code"),
    ocrCollectorNumber: text("ocr_collector_number"),
    candidateJson: jsonb("candidate_json")
      .notNull()
      .default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (table) => [
    check(
      "scan_artifacts_status_check",
      sql`${table.status} in ('matched', 'ambiguous', 'no_match', 'failed')`,
    ),
    index("scan_artifacts_account_idx").on(table.accountId),
    index("scan_artifacts_session_idx").on(table.sessionId),
  ],
);

export const scanReviewItems = pgTable(
  "scan_review_items",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => scanSessions.id, { onDelete: "cascade" }),
    scanArtifactId: uuid("scan_artifact_id")
      .notNull()
      .references(() => scanArtifacts.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    catalogCardId: text("catalog_card_id").notNull(),
    canonicalCardId: text("canonical_card_id").notNull(),
    oracleId: text("oracle_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    imageUri: text("image_uri").notNull(),
    similarityScore: integer("similarity_score").notNull(),
    ocrScore: integer("ocr_score").notNull(),
    finalScore: integer("final_score").notNull(),
    matchReason: text("match_reason").notNull(),
    finish: text("finish").notNull(),
    condition: text("condition").notNull(),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (table) => [
    check("scan_review_items_quantity_check", sql`${table.quantity} > 0`),
    check(
      "scan_review_items_finish_check",
      sql`${table.finish} in ('nonfoil', 'foil')`,
    ),
    check(
      "scan_review_items_condition_check",
      sql`${table.condition} in ('NM', 'LP', 'MP', 'HP', 'DMG')`,
    ),
    index("scan_review_items_account_idx").on(table.accountId),
    index("scan_review_items_session_idx").on(table.sessionId),
    index("scan_review_items_artifact_idx").on(table.scanArtifactId),
  ],
);

export const inventoryMutationRequests = pgTable(
  "inventory_mutation_requests",
  {
    accountId: text("account_id").notNull(),
    requestId: text("request_id").notNull(),
    requestHash: text("request_hash"),
    acknowledgement: jsonb("acknowledgement").$type<InventoryAcknowledgement>(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.requestId] }),
    check(
      "inventory_mutation_requests_source_check",
      sql`${table.source} in ('mobile', 'web', 'import', 'scan', 'scan_review')`,
    ),
    check(
      "inventory_mutation_requests_status_check",
      sql`${table.status} in ('applied', 'pending', 'rejected')`,
    ),
  ],
);

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const catalogGenerations = pgTable(
  "catalog_generations",
  {
    id: uuid("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
    }).notNull(),
    documentCount: integer("document_count").notNull().default(0),
    schemaVersion: integer("schema_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    check("catalog_generations_count_check", sql`${table.documentCount} >= 0`),
  ],
);

export const catalogState = pgTable(
  "catalog_state",
  {
    id: integer("id").primaryKey(),
    activeGeneration: uuid("active_generation").references(
      () => catalogGenerations.id,
    ),
    previousGeneration: uuid("previous_generation").references(
      () => catalogGenerations.id,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("catalog_state_singleton_check", sql`${table.id} = 1`)],
);

export const catalogPrintings = pgTable(
  "catalog_printings",
  {
    generationId: uuid("generation_id")
      .notNull()
      .references(() => catalogGenerations.id, { onDelete: "cascade" }),
    id: uuid("id").notNull(),
    oracleId: uuid("oracle_id").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    printedName: text("printed_name").notNull(),
    lang: text("lang").notNull(),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity").notNull(),
    cmc: doublePrecision("cmc").notNull(),
    colors: text("colors").array().notNull(),
    cardTypes: text("card_types").array().notNull(),
    legalities: jsonb("legalities").notNull(),
    searchName: text("search_name").notNull(),
    searchText: text("search_text").notNull(),
    document: jsonb("document").notNull(),
    colorIdentityMask: smallint("color_identity_mask").generatedAlwaysAs(
      sql`CASE WHEN document->'color_identity' <@ '["W","U","B","R","G"]'::jsonb THEN
				CASE WHEN document->'color_identity' @> '"W"'::jsonb THEN 1 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"U"'::jsonb THEN 2 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"B"'::jsonb THEN 4 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"R"'::jsonb THEN 8 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"G"'::jsonb THEN 16 ELSE 0 END
				ELSE NULL END`,
    ),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', search_text)`,
    ),
  },
  (table) => [
    primaryKey({ columns: [table.generationId, table.id] }),
    index("catalog_printings_oracle_idx").on(
      table.generationId,
      table.oracleId,
    ),
    index("catalog_printings_name_idx").on(
      table.generationId,
      table.normalizedName,
    ),
    index("catalog_printings_set_collector_idx").on(
      table.generationId,
      table.setCode,
      table.collectorNumber,
    ),
    index("catalog_printings_set_id_idx").on(
      table.generationId,
      table.setCode,
      table.id,
    ),
    index("catalog_printings_order_idx").on(
      table.generationId,
      table.name,
      table.id,
    ),
    index("catalog_printings_search_name_idx").using(
      "gin",
      sql`${table.searchName} gin_trgm_ops`,
    ),
    index("catalog_printings_search_vector_idx").using(
      "gin",
      table.searchVector,
    ),
    index("catalog_printings_colors_idx").using("gin", table.colors),
    index("catalog_printings_color_identity_idx").on(
      table.generationId,
      table.colorIdentityMask,
    ),
    index("catalog_printings_card_types_idx").using("gin", table.cardTypes),
    index("catalog_printings_legalities_idx").using("gin", table.legalities),
  ],
);

export const pricePublications = pgTable("price_publications", {
  id: uuid("id").primaryKey(),
  catalogGenerationId: uuid("catalog_generation_id").notNull(),
  descriptor: jsonb("descriptor").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", {
    withTimezone: true,
  }).notNull(),
  payloadDigest: text("payload_digest").notNull(),
  extractorVersion: integer("extractor_version").notNull(),
  mappingVersion: integer("mapping_version").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const pricePrintings = pgTable(
  "price_printings",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => pricePublications.id, { onDelete: "cascade" }),
    id: uuid("id").notNull(),
    oracleId: uuid("oracle_id").notNull(),
    setId: uuid("set_id").notNull(),
    setCode: text("set_code").notNull(),
    collectorNumber: text("collector_number").notNull(),
    lang: text("lang").notNull(),
    finishes: text("finishes").array().notNull(),
    variantKey: text("variant_key"),
    identity: jsonb("identity").notNull(),
    links: jsonb("links").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.id] }),
    index("price_printings_variant_idx").on(
      t.publicationId,
      t.variantKey,
      t.lang,
    ),
  ],
);
export const priceObservations = pgTable(
  "price_observations",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => pricePublications.id, { onDelete: "cascade" }),
    printingId: uuid("printing_id").notNull(),
    finish: text("finish").notNull(),
    measure: text("measure").notNull(),
    amount: numeric("amount"),
    rawValue: text("raw_value"),
    supported: boolean("supported").notNull(),
    englishPrintingId: uuid("english_printing_id"),
    mappingReason: text("mapping_reason"),
  },
  (t) => [
    primaryKey({
      columns: [t.publicationId, t.printingId, t.finish, t.measure],
    }),
    check(
      "price_observations_finish_check",
      sql`${t.finish} in ('nonfoil','foil')`,
    ),
    check(
      "price_observations_amount_check",
      sql`${t.amount} >= 0 AND ${t.amount} != 'NaN'::numeric AND ${t.amount} != 'Infinity'::numeric`,
    ),
  ],
);
export const priceState = pgTable(
  "price_state",
  {
    id: integer("id").primaryKey(),
    activePublication: uuid("active_publication").references(
      () => pricePublications.id,
    ),
    previousPublication: uuid("previous_publication").references(
      () => pricePublications.id,
    ),
    refreshStatus: jsonb("refresh_status")
      .notNull()
      .default(sql`'{"kind":"NeverAttempted"}'::jsonb`),
  },
  (t) => [check("price_state_id_check", sql`${t.id}=1`)],
);

export const oracleTagPublications = pgTable("oracle_tag_publications", {
  id: uuid("id").primaryKey(),
  descriptor: jsonb("descriptor").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", {
    withTimezone: true,
  }).notNull(),
  payloadDigest: text("payload_digest").notNull(),
  parserVersion: integer("parser_version").notNull(),
  mappingVersion: integer("mapping_version").notNull(),
  mapping: jsonb("mapping").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const oracleTags = pgTable(
  "oracle_tags",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => oracleTagPublications.id, { onDelete: "cascade" }),
    id: uuid("id").notNull(),
    label: text("label").notNull(),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.id] })],
);
export const oracleTagClosure = pgTable(
  "oracle_tag_closure",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => oracleTagPublications.id, { onDelete: "cascade" }),
    ancestorId: uuid("ancestor_id").notNull(),
    descendantId: uuid("descendant_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.ancestorId, t.descendantId] }),
  ],
);
export const oracleTagMemberships = pgTable(
  "oracle_tag_memberships",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => oracleTagPublications.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id").notNull(),
    oracleId: uuid("oracle_id").notNull(),
    weight: text("weight").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.tagId, t.oracleId] }),
    index("oracle_tag_memberships_card_idx").on(
      t.publicationId,
      t.oracleId,
      t.tagId,
    ),
  ],
);
export const oracleTagState = pgTable(
  "oracle_tag_state",
  {
    id: integer("id").primaryKey(),
    activePublication: uuid("active_publication").references(
      () => oracleTagPublications.id,
    ),
    previousPublication: uuid("previous_publication").references(
      () => oracleTagPublications.id,
    ),
    refreshStatus: jsonb("refresh_status")
      .notNull()
      .default(sql`'{"kind":"NeverAttempted"}'::jsonb`),
  },
  (t) => [check("oracle_tag_state_id_check", sql`${t.id}=1`)],
);
export const catalogOracleFacts = pgTable(
  "catalog_oracle_facts",
  {
    generationId: uuid("generation_id")
      .notNull()
      .references(() => catalogGenerations.id, { onDelete: "cascade" }),
    printingId: uuid("printing_id").notNull(),
    rawOracleId: uuid("raw_oracle_id"),
    types: text("types").array(),
    keywords: text("keywords").array(),
    transformVersion: integer("transform_version").notNull(),
  },
  (t) => [primaryKey({ columns: [t.generationId, t.printingId] })],
);
export const categoryLibraryState = pgTable(
  "category_library_state",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    revision: bigint("revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [check("category_library_revision_check", sql`${t.revision}>=0`)],
);
export const categoryDefinitionOrigins = pgTable(
  "category_definition_origins",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    currentVersion: integer("current_version").notNull(),
    normalizedName: text("normalized_name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [
    check("category_origin_scope_check", sql`${t.scope} IN ('entry','deck')`),
    check("category_origin_version_check", sql`${t.currentVersion}>0`),
    uniqueIndex("category_active_name_unique")
      .on(t.accountId, t.scope, t.normalizedName)
      .where(sql`NOT ${t.archived}`),
  ],
);
export const categoryDefinitionVersions = pgTable(
  "category_definition_versions",
  {
    id: uuid("id").primaryKey(),
    originId: uuid("origin_id")
      .notNull()
      .references(() => categoryDefinitionOrigins.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
  },
  (t) => [
    uniqueIndex("category_definition_version_unique").on(t.originId, t.version),
    check("category_version_positive", sql`${t.version}>0`),
  ],
);
export const categoryChangePreviews = pgTable(
  "category_change_previews",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    deckId: uuid("deck_id").notNull(),
    scope: text("scope").notNull(),
    mode: text("mode").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    differenceTotal: integer("difference_total").notNull().default(0),
    blocked: boolean("blocked").notNull().default(false),
    plan: jsonb("plan"),
    acknowledgement: jsonb("acknowledgement"),
  },
  (t) => [
    uniqueIndex("category_preview_request_unique").on(t.accountId, t.requestId),
    index("category_preview_capacity_idx").on(t.accountId, t.expiresAt),
    index("category_preview_cleanup_idx")
      .on(t.accountId, t.expiresAt, t.id)
      .where(sql`${t.plan} IS NOT NULL`),
    check("category_preview_scope_check", sql`${t.scope} IN ('entry','deck')`),
    check("category_preview_mode_check", sql`${t.mode} IN ('Review','Reset')`),
  ],
);
export const categoryPreviewDifferences = pgTable(
  "category_preview_differences",
  {
    previewId: uuid("preview_id")
      .notNull()
      .references(() => categoryChangePreviews.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    difference: jsonb("difference").notNull(),
  },
  (t) => [primaryKey({ columns: [t.previewId, t.position] })],
);
export const deckCategoryBundles = pgTable(
  "deck_category_bundles",
  {
    deckId: uuid("deck_id")
      .primaryKey()
      .references(() => decks.id, { onDelete: "cascade" }),
    definitions: jsonb("definitions").notNull(),
    wholeDeckDefinitions: jsonb("whole_deck_definitions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    libraryRevision: bigint("library_revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    suppressedOrigins: uuid("suppressed_origins")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    decisionRevision: bigint("decision_revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [
    check(
      "deck_category_bundles_revision_check",
      sql`${t.decisionRevision}>=0`,
    ),
  ],
);
export const deckEntryCategoryDecisions = pgTable(
  "deck_entry_category_decisions",
  {
    entryId: uuid("entry_id")
      .primaryKey()
      .references(() => deckCards.id, { onDelete: "cascade" }),
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    definitionSnapshot: jsonb("definition_snapshot"),
    previousEvaluation: jsonb("previous_evaluation"),
    categoryId: uuid("category_id"),
    state: text("state").notNull(),
    revision: bigint("revision", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    evidence: jsonb("evidence"),
  },
  (t) => [
    index("deck_entry_category_decisions_deck_idx").on(t.deckId),
    check(
      "deck_entry_category_decisions_state_check",
      sql`${t.state} in ('Automatic','Manual','Pending')`,
    ),
    check("deck_entry_category_decisions_revision_check", sql`${t.revision}>0`),
  ],
);
export const categoryMutationRequests = pgTable(
  "category_mutation_requests",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    requestId: uuid("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    acknowledgement: jsonb("acknowledgement").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.requestId] })],
);

export const deckLibraryState = pgTable(
  "deck_library_state",
  {
    accountId: text("account_id")
      .primaryKey()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    revision: bigint("revision", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [check("deck_library_revision_check", sql`${t.revision}>=0`)],
);
export const deckWholeCategories = pgTable(
  "deck_whole_categories",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull(),
    originId: uuid("origin_id").notNull(),
    definitionSnapshot: jsonb("definition_snapshot").notNull(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
    suppressed: boolean("suppressed").notNull().default(false),
    automaticActive: boolean("automatic_active").notNull().default(true),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.versionId] }),
    index("deck_whole_categories_version_idx").on(t.versionId, t.deckId),
  ],
);
export const deckWholeCategoryDecisions = pgTable(
  "deck_whole_category_decisions",
  {
    deckId: uuid("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").notNull(),
    state: text("state").notNull(),
    manual: text("manual"),
    truth: text("truth"),
    attemptedTruth: text("attempted_truth"),
    revision: bigint("revision", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    evidence: jsonb("evidence"),
    previousEvaluation: jsonb("previous_evaluation"),
  },
  (t) => [
    primaryKey({ columns: [t.deckId, t.versionId] }),
    check(
      "whole_category_state_check",
      sql`${t.state} IN ('Automatic','Pending','Manual')`,
    ),
    check(
      "whole_category_manual_check",
      sql`${t.manual} IS NULL OR ${t.manual} IN ('Include','Exclude')`,
    ),
    check(
      "whole_category_truth_check",
      sql`${t.truth} IS NULL OR ${t.truth} IN ('True','False')`,
    ),
    check(
      "whole_category_attempt_check",
      sql`${t.attemptedTruth} IS NULL OR ${t.attemptedTruth} IN ('True','False','Unknown')`,
    ),
    check("whole_category_revision_check", sql`${t.revision}>0`),
    foreignKey({
      columns: [t.deckId, t.versionId],
      foreignColumns: [
        deckWholeCategories.deckId,
        deckWholeCategories.versionId,
      ],
    }).onDelete("cascade"),
  ],
);
export const deckWholeCategoryJobs = pgTable(
  "deck_whole_category_jobs",
  {
    deckId: uuid("deck_id")
      .primaryKey()
      .references(() => decks.id, { onDelete: "cascade" }),
    generation: bigint("generation", { mode: "bigint" }).notNull(),
    compositionRevision: bigint("composition_revision", {
      mode: "bigint",
    }).notNull(),
    decisionRevision: bigint("decision_revision", { mode: "bigint" }).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    index("whole_category_job_due_idx").on(t.availableAt, t.deckId),
    check("whole_category_job_generation_check", sql`${t.generation}>0`),
    check("whole_category_job_attempts_check", sql`${t.attempts}>=0`),
  ],
);

export const optionalPricePublications = pgTable(
  "optional_price_publications",
  {
    id: uuid("id").primaryKey(),
    source: text("source").notNull(),
    timePrecision: text("time_precision").notNull(),
    sourceInstant: timestamp("source_instant", { withTimezone: true }),
    sourceDate: date("source_date"),
    descriptor: jsonb("descriptor").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    extractorVersion: integer("extractor_version").notNull(),
    mappingVersion: integer("mapping_version").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "optional_price_publications_source_check",
      sql`${t.source} in ('Cardmarket','MTGJSON')`,
    ),
    check(
      "optional_price_publications_time_precision_check",
      sql`${t.timePrecision} in ('Instant','Day')`,
    ),
    check(
      "optional_price_publications_time_check",
      sql`(${t.timePrecision}='Instant' AND ${t.sourceInstant} IS NOT NULL AND ${t.sourceDate} IS NULL) OR (${t.timePrecision}='Day' AND ${t.sourceDate} IS NOT NULL AND ${t.sourceInstant} IS NULL)`,
    ),
  ],
);
export const optionalPriceState = pgTable(
  "optional_price_state",
  {
    source: text("source").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    activePublication: uuid("active_publication").references(
      () => optionalPricePublications.id,
    ),
    previousPublication: uuid("previous_publication").references(
      () => optionalPricePublications.id,
    ),
    refreshStatus: jsonb("refresh_status")
      .notNull()
      .default(sql`'{"kind":"NeverAttempted"}'::jsonb`),
  },
  (t) => [
    check(
      "optional_price_state_source_check",
      sql`${t.source} in ('Cardmarket','MTGJSON')`,
    ),
  ],
);
export const optionalPricePrintings = pgTable(
  "optional_price_printings",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => optionalPricePublications.id, { onDelete: "cascade" }),
    printingId: uuid("printing_id").notNull(),
    identity: jsonb("identity").notNull(),
    finishes: text("finishes").array().notNull(),
    variantKey: text("variant_key"),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.printingId] })],
);
export const optionalPriceObservations = pgTable(
  "optional_price_observations",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => optionalPricePublications.id, { onDelete: "cascade" }),
    printingId: uuid("printing_id").notNull(),
    finish: text("finish").notNull(),
    measure: text("measure").notNull(),
    amount: numeric("amount"),
    rawValue: text("raw_value"),
    supported: boolean("supported").notNull(),
    providerId: text("provider_id"),
    englishPrintingId: uuid("english_printing_id"),
    mappingReason: text("mapping_reason"),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.printingId, t.finish] }),
    check(
      "optional_price_observations_finish_check",
      sql`${t.finish} in ('nonfoil','foil')`,
    ),
    check(
      "optional_price_observations_amount_check",
      sql`${t.amount} >= 0 AND ${t.amount} NOT IN ('NaN'::numeric,'Infinity'::numeric)`,
    ),
  ],
);
export const priceHistoryDays = pgTable(
  "price_history_days",
  {
    source: text("source").notNull(),
    day: date("day").notNull(),
    sourceInstant: timestamp("source_instant", { withTimezone: true }),
    publicationId: uuid("publication_id").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.day] }),
    check(
      "price_history_days_source_check",
      sql`${t.source} in ('Scryfall','Cardmarket','MTGJSON')`,
    ),
  ],
);
export const priceSourceHistory = pgTable(
  "price_source_history",
  {
    source: text("source").notNull(),
    printingId: uuid("printing_id").notNull(),
    finish: text("finish").notNull(),
    day: date("day").notNull(),
    timePrecision: text("time_precision").notNull(),
    sourceInstant: timestamp("source_instant", { withTimezone: true }),
    amount: numeric("amount").notNull(),
    measure: text("measure").notNull(),
    rawValue: text("raw_value"),
    providerId: text("provider_id"),
    publicationId: uuid("publication_id").notNull(),
    evidence: jsonb("evidence").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.source, t.printingId, t.finish, t.day] }),
    index("price_source_history_window").on(
      t.printingId,
      t.finish,
      t.day,
      t.source,
    ),
    index("price_source_history_publication").on(t.source, t.publicationId),
    check(
      "price_source_history_source_check",
      sql`${t.source} in ('Scryfall','Cardmarket','MTGJSON')`,
    ),
    check(
      "price_source_history_finish_check",
      sql`${t.finish} in ('nonfoil','foil')`,
    ),
    check(
      "price_source_history_time_precision_check",
      sql`${t.timePrecision} in ('Instant','Day')`,
    ),
    check(
      "price_source_history_amount_check",
      sql`${t.amount} >= 0 AND ${t.amount} NOT IN ('NaN'::numeric,'Infinity'::numeric)`,
    ),
    check(
      "price_source_history_time_check",
      sql`(${t.timePrecision}='Instant' AND ${t.sourceInstant} IS NOT NULL) OR (${t.timePrecision}='Day' AND ${t.sourceInstant} IS NULL)`,
    ),
  ],
);

export const priceHistoryPublications = pgTable(
  "price_history_publications",
  {
    publicationId: uuid("publication_id").primaryKey(),
    source: text("source").notNull(),
    evidence: jsonb("evidence").notNull(),
  },
  (t) => [
    check(
      "price_history_publications_source_check",
      sql`${t.source} in ('Scryfall','Cardmarket','MTGJSON')`,
    ),
  ],
);
export const priceHistoryPrintings = pgTable(
  "price_history_printings",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => priceHistoryPublications.publicationId, {
        onDelete: "cascade",
      }),
    printingId: uuid("printing_id").notNull(),
    identity: jsonb("identity").notNull(),
    variantKey: text("variant_key"),
  },
  (t) => [primaryKey({ columns: [t.publicationId, t.printingId] })],
);

export const inventoryValueDays = pgTable(
  "inventory_value_days",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => userProfiles.accountId, { onDelete: "cascade" }),
    game: text("game").notNull(),
    day: date("day").notNull(),
    timezone: text("timezone").notNull(),
    dayStart: timestamp("day_start", { withTimezone: true }).notNull(),
    dayEnd: timestamp("day_end", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    inventoryRevision: decimalRevision("inventory_revision")
      .notNull()
      .default("0"),
    policyVersion: text("policy_version")
      .notNull()
      .default("daily-final-minute-v1"),
    estimate: jsonb("estimate")
      .$type<import("@spellbook/contracts/inventory-value.ts").ValueEstimate>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("inventory_value_days_owner_date_idx").on(
      table.accountId,
      table.game,
      table.day,
    ),
    check("inventory_value_days_game_check", sql`${table.game} = 'mtg'`),
    check(
      "inventory_value_days_observation_check",
      sql`${table.observedAt} >= ${table.dayEnd} - interval '60 seconds' and ${table.observedAt} < ${table.dayEnd} and ${table.dayStart} < ${table.dayEnd}`,
    ),
  ],
);
export const inventoryValueReferences = pgTable(
  "inventory_value_references",
  {
    dayId: uuid("day_id")
      .notNull()
      .references(() => inventoryValueDays.id, { onDelete: "cascade" }),
    printingId: text("printing_id").notNull(),
    finish: text("finish").notNull(),
    evidence: jsonb("evidence")
      .$type<import("../valuation/read.ts").FrozenReferenceOutcome>()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dayId, table.printingId, table.finish] }),
    check(
      "inventory_value_references_finish_check",
      sql`${table.finish} in ('nonfoil','foil')`,
    ),
  ],
);
export const inventoryValueHoldings = pgTable(
  "inventory_value_holdings",
  {
    dayId: uuid("day_id")
      .notNull()
      .references(() => inventoryValueDays.id, { onDelete: "cascade" }),
    printingId: text("printing_id").notNull(),
    finish: text("finish").notNull(),
    condition: text("condition").notNull(),
    canonicalCardId: text("canonical_card_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    imageUri: text("image_uri").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.dayId, table.printingId, table.finish, table.condition],
    }),
    check(
      "inventory_value_holdings_quantity_check",
      sql`${table.quantity} > 0`,
    ),
    check(
      "inventory_value_holdings_finish_check",
      sql`${table.finish} in ('nonfoil','foil')`,
    ),
    check(
      "inventory_value_holdings_condition_check",
      sql`${table.condition} in ('NM','LP','MP','HP','DMG')`,
    ),
  ],
);

export const comboPublications = pgTable(
  "combo_publications",
  {
    id: uuid("id").primaryKey(),
    descriptor: jsonb("descriptor").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", {
      withTimezone: true,
    }).notNull(),
    sourceVersion: text("source_version").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    decodedDigest: text("decoded_digest").notNull(),
    parserVersion: integer("parser_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    variantCount: integer("variant_count").notNull(),
    outcomeCount: integer("outcome_count").notNull(),
    aliasCount: integer("alias_count").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "combo_publications_counts_check",
      sql`${t.variantCount} >= 0 and ${t.outcomeCount} >= 0 and ${t.aliasCount} >= 0`,
    ),
    check(
      "combo_publications_policy_check",
      sql`${t.parserVersion} > 0 and ${t.policyVersion} = 'ingredients-v1'`,
    ),
  ],
);
export const comboState = pgTable(
  "combo_state",
  {
    id: integer("id").primaryKey(),
    activePublication: uuid("active_publication").references(
      () => comboPublications.id,
    ),
    previousPublication: uuid("previous_publication").references(
      () => comboPublications.id,
    ),
    refreshStatus: jsonb("refresh_status")
      .notNull()
      .default(sql`'{"kind":"NeverAttempted"}'::jsonb`),
  },
  (t) => [check("combo_state_id_check", sql`${t.id} = 1`)],
);
export const comboOutcomes = pgTable(
  "combo_outcomes",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => comboPublications.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    uncountable: boolean("uncountable").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.id] }),
    check("combo_outcomes_id_check", sql`${t.id} ~ '^[1-9][0-9]{0,19}$'`),
    index("combo_outcomes_name_idx").on(t.publicationId, t.name, t.id),
  ],
);
export const comboVariants = pgTable(
  "combo_variants",
  {
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => comboPublications.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    document: jsonb("document")
      .$type<import("@spellbook/contracts/combo.ts").ComboVariant>()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.id] }),
    check(
      "combo_variants_id_check",
      sql`char_length(${t.id}) between 1 and 128`,
    ),
  ],
);
export const comboVariantIngredients = pgTable(
  "combo_variant_ingredients",
  {
    publicationId: uuid("publication_id").notNull(),
    variantId: text("variant_id").notNull(),
    position: integer("position").notNull(),
    oracleId: uuid("oracle_id"),
    quantity: numeric("quantity", { precision: 100, scale: 0 }).notNull(),
    mustBeCommander: boolean("must_be_commander").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.variantId, t.position] }),
    foreignKey({
      columns: [t.publicationId, t.variantId],
      foreignColumns: [comboVariants.publicationId, comboVariants.id],
    }).onDelete("cascade"),
    check(
      "combo_variant_ingredients_quantity_check",
      sql`${t.quantity} > 0 and ${t.quantity} <> 'NaN'::numeric`,
    ),
    check("combo_variant_ingredients_position_check", sql`${t.position} >= 0`),
    index("combo_variant_ingredients_oracle_idx").on(
      t.publicationId,
      t.oracleId,
      t.variantId,
    ),
  ],
);
export const comboVariantOutcomes = pgTable(
  "combo_variant_outcomes",
  {
    publicationId: uuid("publication_id").notNull(),
    variantId: text("variant_id").notNull(),
    outcomeId: text("outcome_id").notNull(),
    quantity: numeric("quantity", { precision: 100, scale: 0 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.publicationId, t.variantId, t.outcomeId] }),
    foreignKey({
      columns: [t.publicationId, t.variantId],
      foreignColumns: [comboVariants.publicationId, comboVariants.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.publicationId, t.outcomeId],
      foreignColumns: [comboOutcomes.publicationId, comboOutcomes.id],
    }).onDelete("cascade"),
    check(
      "combo_variant_outcomes_quantity_check",
      sql`${t.quantity} > 0 and ${t.quantity} <> 'NaN'::numeric`,
    ),
    index("combo_variant_outcomes_outcome_idx").on(
      t.publicationId,
      t.outcomeId,
      t.variantId,
    ),
  ],
);
