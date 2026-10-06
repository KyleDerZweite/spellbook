import { sql } from 'drizzle-orm';
import type { ProfileCardDefinition } from '@spellbook/contracts/profile.ts';
import {
	check,
	customType,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const userProfiles = pgTable('user_profiles', {
	accountId: text('account_id').primaryKey(),
	username: text('username').notNull(),
	email: text('email').notNull().default(''),
	avatarId: text('avatar_id').notNull().default('wizard'),
	artworkId: text('artwork_id').notNull().default('grove'),
	profileCard: jsonb('profile_card').$type<ProfileCardDefinition>(),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
});

export const localCredentials = pgTable('local_credentials', {
	accountId: text('account_id')
		.primaryKey()
		.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	...timestamps
});

export const authSessions = pgTable(
	'auth_sessions',
	{
		tokenHash: text('token_hash').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('auth_sessions_account_idx').on(table.accountId)]
);

export const authIdentities = pgTable(
	'auth_identities',
	{
		id: uuid('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
		providerType: text('provider_type').notNull(),
		issuer: text('issuer').notNull(),
		subject: text('subject').notNull(),
		emailAtLogin: text('email_at_login').notNull().default(''),
		...timestamps
	},
	(table) => [
		uniqueIndex('auth_identities_provider_subject_idx').on(
			table.providerType,
			table.issuer,
			table.subject
		),
		index('auth_identities_account_idx').on(table.accountId)
	]
);

export const inventories = pgTable(
	'inventories',
	{
		id: uuid('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
		game: text('game').notNull(),
		...timestamps
	},
	(table) => [
		check('inventories_game_check', sql`${table.game} in ('mtg')`),
		uniqueIndex('inventories_account_game_idx').on(table.accountId, table.game)
	]
);

export const inventoryCards = pgTable(
	'inventory_cards',
	{
		id: uuid('id').primaryKey(),
		inventoryId: uuid('inventory_id')
			.notNull()
			.references(() => inventories.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		game: text('game').notNull(),
		catalogCardId: text('catalog_card_id').notNull(),
		canonicalCardId: text('canonical_card_id').notNull(),
		name: text('name').notNull(),
		setCode: text('set_code').notNull(),
		imageUri: text('image_uri').notNull(),
		quantity: integer('quantity').notNull(),
		finish: text('finish').notNull(),
		condition: text('condition').notNull(),
		notes: text('notes').notNull().default(''),
		spellbookPosition: integer('spellbook_position').notNull(),
		...timestamps
	},
	(table) => [
		check('inventory_cards_quantity_check', sql`${table.quantity} > 0`),
		check('inventory_cards_spellbook_position_check', sql`${table.spellbookPosition} >= 0`),
		check('inventory_cards_finish_check', sql`${table.finish} in ('nonfoil', 'foil')`),
		check(
			'inventory_cards_condition_check',
			sql`${table.condition} in ('NM', 'LP', 'MP', 'HP', 'DMG')`
		),
		uniqueIndex('inventory_cards_unique_printing_idx').on(
			table.inventoryId,
			table.catalogCardId,
			table.finish,
			table.condition
		),
		index('inventory_cards_account_game_idx').on(table.accountId, table.game),
		index('inventory_cards_inventory_position_idx').on(table.inventoryId, table.spellbookPosition),
		index('inventory_cards_canonical_card_idx').on(table.canonicalCardId)
	]
);

export const inventoryGroups = pgTable(
	'inventory_groups',
	{
		id: uuid('id').primaryKey(),
		inventoryId: uuid('inventory_id')
			.notNull()
			.references(() => inventories.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		...timestamps
	},
	(table) => [
		check(
			'inventory_groups_name_check',
			sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) between 1 and 64`
		),
		uniqueIndex('inventory_groups_inventory_name_idx').on(
			table.inventoryId,
			sql`lower(${table.name})`
		)
	]
);

export const inventoryGroupMemberships = pgTable(
	'inventory_group_memberships',
	{
		groupId: uuid('group_id')
			.notNull()
			.references(() => inventoryGroups.id, { onDelete: 'cascade' }),
		entryId: uuid('entry_id')
			.notNull()
			.references(() => inventoryCards.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.groupId, table.entryId] }),
		index('inventory_group_memberships_entry_idx').on(table.entryId)
	]
);

export const decks = pgTable(
	'decks',
	{
		id: uuid('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
		game: text('game').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		format: text('format').notNull().default('Commander'),
		...timestamps
	},
	(table) => [
		check('decks_game_check', sql`${table.game} in ('mtg')`),
		index('decks_account_game_updated_idx').on(table.accountId, table.game, table.updatedAt)
	]
);

export const deckCards = pgTable(
	'deck_cards',
	{
		id: uuid('id').primaryKey(),
		deckId: uuid('deck_id')
			.notNull()
			.references(() => decks.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		game: text('game').notNull(),
		catalogCardId: text('catalog_card_id').notNull(),
		canonicalCardId: text('canonical_card_id').notNull(),
		name: text('name').notNull(),
		setCode: text('set_code').notNull(),
		imageUri: text('image_uri').notNull(),
		quantity: integer('quantity').notNull(),
		role: text('role').notNull().default('main'),
		...timestamps
	},
	(table) => [
		check('deck_cards_quantity_check', sql`${table.quantity} > 0`),
		check(
			'deck_cards_role_check',
			sql`${table.role} in ('main', 'sideboard', 'commander', 'companion')`
		),
		check('deck_cards_game_check', sql`${table.game} in ('mtg')`),
		uniqueIndex('deck_cards_unique_card_role_idx').on(
			table.deckId,
			table.catalogCardId,
			table.role
		),
		index('deck_cards_account_game_idx').on(table.accountId, table.game),
		index('deck_cards_deck_idx').on(table.deckId)
	]
);

export const deckMutationRequests = pgTable(
	'deck_mutation_requests',
	{
		accountId: text('account_id').notNull(),
		requestId: text('request_id').notNull(),
		requestHash: text('request_hash'),
		deckId: uuid('deck_id')
			.notNull()
			.references(() => decks.id, { onDelete: 'cascade' }),
		source: text('source').notNull(),
		status: text('status').notNull(),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.requestId] }),
		check(
			'deck_mutation_requests_source_check',
			sql`${table.source} in ('mobile', 'web', 'import')`
		),
		check(
			'deck_mutation_requests_status_check',
			sql`${table.status} in ('applied', 'pending', 'rejected')`
		)
	]
);

export const scanSessions = pgTable(
	'scan_sessions',
	{
		id: uuid('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => userProfiles.accountId, { onDelete: 'cascade' }),
		game: text('game').notNull(),
		status: text('status').notNull(),
		...timestamps
	},
	(table) => [
		check('scan_sessions_game_check', sql`${table.game} in ('mtg')`),
		check(
			'scan_sessions_status_check',
			sql`${table.status} in ('open', 'pending_review', 'committed', 'cancelled')`
		),
		index('scan_sessions_account_game_updated_idx').on(table.accountId, table.game, table.updatedAt)
	]
);

export const scanArtifacts = pgTable(
	'scan_artifacts',
	{
		id: uuid('id').primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => scanSessions.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		originalObjectKey: text('original_object_key').notNull(),
		normalizedObjectKey: text('normalized_object_key').notNull(),
		qualityScore: integer('quality_score').notNull(),
		embeddingModelVersion: text('embedding_model_version').notNull(),
		ocrModelVersion: text('ocr_model_version').notNull(),
		status: text('status').notNull(),
		ocrName: text('ocr_name'),
		ocrSetCode: text('ocr_set_code'),
		ocrCollectorNumber: text('ocr_collector_number'),
		candidateJson: jsonb('candidate_json')
			.notNull()
			.default(sql`'[]'::jsonb`),
		...timestamps
	},
	(table) => [
		check(
			'scan_artifacts_status_check',
			sql`${table.status} in ('matched', 'ambiguous', 'no_match', 'failed')`
		),
		index('scan_artifacts_account_idx').on(table.accountId),
		index('scan_artifacts_session_idx').on(table.sessionId)
	]
);

export const scanReviewItems = pgTable(
	'scan_review_items',
	{
		id: uuid('id').primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => scanSessions.id, { onDelete: 'cascade' }),
		scanArtifactId: uuid('scan_artifact_id')
			.notNull()
			.references(() => scanArtifacts.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		catalogCardId: text('catalog_card_id').notNull(),
		canonicalCardId: text('canonical_card_id').notNull(),
		oracleId: text('oracle_id').notNull(),
		name: text('name').notNull(),
		setCode: text('set_code').notNull(),
		collectorNumber: text('collector_number').notNull(),
		imageUri: text('image_uri').notNull(),
		similarityScore: integer('similarity_score').notNull(),
		ocrScore: integer('ocr_score').notNull(),
		finalScore: integer('final_score').notNull(),
		matchReason: text('match_reason').notNull(),
		finish: text('finish').notNull(),
		condition: text('condition').notNull(),
		quantity: integer('quantity').notNull(),
		...timestamps
	},
	(table) => [
		check('scan_review_items_quantity_check', sql`${table.quantity} > 0`),
		check('scan_review_items_finish_check', sql`${table.finish} in ('nonfoil', 'foil')`),
		check(
			'scan_review_items_condition_check',
			sql`${table.condition} in ('NM', 'LP', 'MP', 'HP', 'DMG')`
		),
		index('scan_review_items_account_idx').on(table.accountId),
		index('scan_review_items_session_idx').on(table.sessionId),
		index('scan_review_items_artifact_idx').on(table.scanArtifactId)
	]
);

export const inventoryMutationRequests = pgTable(
	'inventory_mutation_requests',
	{
		accountId: text('account_id').notNull(),
		requestId: text('request_id').notNull(),
		requestHash: text('request_hash'),
		source: text('source').notNull(),
		status: text('status').notNull(),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.requestId] }),
		check(
			'inventory_mutation_requests_source_check',
			sql`${table.source} in ('mobile', 'web', 'import', 'scan', 'scan_review')`
		),
		check(
			'inventory_mutation_requests_status_check',
			sql`${table.status} in ('applied', 'pending', 'rejected')`
		)
	]
);

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const catalogGenerations = pgTable(
	'catalog_generations',
	{
		id: uuid('id').primaryKey(),
		sourceType: text('source_type').notNull(),
		sourceUpdatedAt: timestamp('source_updated_at', {
			withTimezone: true
		}).notNull(),
		documentCount: integer('document_count').notNull().default(0),
		schemaVersion: integer('schema_version').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		publishedAt: timestamp('published_at', { withTimezone: true })
	},
	(table) => [check('catalog_generations_count_check', sql`${table.documentCount} >= 0`)]
);

export const catalogState = pgTable(
	'catalog_state',
	{
		id: integer('id').primaryKey(),
		activeGeneration: uuid('active_generation').references(() => catalogGenerations.id),
		previousGeneration: uuid('previous_generation').references(() => catalogGenerations.id),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [check('catalog_state_singleton_check', sql`${table.id} = 1`)]
);

export const catalogPrintings = pgTable(
	'catalog_printings',
	{
		generationId: uuid('generation_id')
			.notNull()
			.references(() => catalogGenerations.id, { onDelete: 'cascade' }),
		id: uuid('id').notNull(),
		oracleId: uuid('oracle_id').notNull(),
		name: text('name').notNull(),
		normalizedName: text('normalized_name').notNull(),
		printedName: text('printed_name').notNull(),
		lang: text('lang').notNull(),
		setCode: text('set_code').notNull(),
		collectorNumber: text('collector_number').notNull(),
		rarity: text('rarity').notNull(),
		cmc: doublePrecision('cmc').notNull(),
		colors: text('colors').array().notNull(),
		cardTypes: text('card_types').array().notNull(),
		legalities: jsonb('legalities').notNull(),
		searchName: text('search_name').notNull(),
		searchText: text('search_text').notNull(),
		document: jsonb('document').notNull(),
		searchVector: tsvector('search_vector').generatedAlwaysAs(
			sql`to_tsvector('simple', search_text)`
		)
	},
	(table) => [
		primaryKey({ columns: [table.generationId, table.id] }),
		index('catalog_printings_oracle_idx').on(table.generationId, table.oracleId),
		index('catalog_printings_name_idx').on(table.generationId, table.normalizedName),
		index('catalog_printings_set_collector_idx').on(
			table.generationId,
			table.setCode,
			table.collectorNumber
		),
		index('catalog_printings_order_idx').on(table.generationId, table.name, table.id),
		index('catalog_printings_search_name_idx').using('gin', sql`${table.searchName} gin_trgm_ops`),
		index('catalog_printings_search_vector_idx').using('gin', table.searchVector),
		index('catalog_printings_colors_idx').using('gin', table.colors),
		index('catalog_printings_card_types_idx').using('gin', table.cardTypes),
		index('catalog_printings_legalities_idx').using('gin', table.legalities)
	]
);
