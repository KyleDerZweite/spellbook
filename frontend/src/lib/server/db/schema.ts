import { sql } from 'drizzle-orm';
import {
	check,
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
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
});

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
	(table) => [uniqueIndex('inventories_account_game_idx').on(table.accountId, table.game)]
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
		uniqueIndex('deck_cards_unique_card_role_idx').on(
			table.deckId,
			table.catalogCardId,
			table.role
		),
		index('deck_cards_account_game_idx').on(table.accountId, table.game),
		index('deck_cards_deck_idx').on(table.deckId)
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
		source: text('source').notNull(),
		status: text('status').notNull(),
		...timestamps
	},
	(table) => [primaryKey({ columns: [table.accountId, table.requestId] })]
);
