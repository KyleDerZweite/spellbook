CREATE TABLE "deck_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"catalog_card_id" text NOT NULL,
	"canonical_card_id" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"image_uri" text NOT NULL,
	"quantity" integer NOT NULL,
	"role" text DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_cards_quantity_check" CHECK ("deck_cards"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'Commander' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"catalog_card_id" text NOT NULL,
	"canonical_card_id" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"image_uri" text NOT NULL,
	"quantity" integer NOT NULL,
	"finish" text NOT NULL,
	"condition" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"spellbook_position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_cards_quantity_check" CHECK ("inventory_cards"."quantity" > 0),
	CONSTRAINT "inventory_cards_spellbook_position_check" CHECK ("inventory_cards"."spellbook_position" >= 0),
	CONSTRAINT "inventory_cards_finish_check" CHECK ("inventory_cards"."finish" in ('nonfoil', 'foil')),
	CONSTRAINT "inventory_cards_condition_check" CHECK ("inventory_cards"."condition" in ('NM', 'LP', 'MP', 'HP', 'DMG'))
);
--> statement-breakpoint
CREATE TABLE "inventory_mutation_requests" (
	"account_id" text NOT NULL,
	"request_id" text NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_mutation_requests_account_id_request_id_pk" PRIMARY KEY("account_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "scan_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"original_object_key" text NOT NULL,
	"normalized_object_key" text NOT NULL,
	"quality_score" integer NOT NULL,
	"embedding_model_version" text NOT NULL,
	"ocr_model_version" text NOT NULL,
	"status" text NOT NULL,
	"ocr_name" text,
	"ocr_set_code" text,
	"ocr_collector_number" text,
	"candidate_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_review_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"scan_artifact_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"catalog_card_id" text NOT NULL,
	"canonical_card_id" text NOT NULL,
	"oracle_id" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"collector_number" text NOT NULL,
	"image_uri" text NOT NULL,
	"similarity_score" integer NOT NULL,
	"ocr_score" integer NOT NULL,
	"final_score" integer NOT NULL,
	"match_reason" text NOT NULL,
	"finish" text NOT NULL,
	"condition" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_review_items_quantity_check" CHECK ("scan_review_items"."quantity" > 0),
	CONSTRAINT "scan_review_items_finish_check" CHECK ("scan_review_items"."finish" in ('nonfoil', 'foil')),
	CONSTRAINT "scan_review_items_condition_check" CHECK ("scan_review_items"."condition" in ('NM', 'LP', 'MP', 'HP', 'DMG'))
);
--> statement-breakpoint
CREATE TABLE "scan_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"account_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_cards" ADD CONSTRAINT "inventory_cards_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_artifacts" ADD CONSTRAINT "scan_artifacts_session_id_scan_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."scan_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_review_items" ADD CONSTRAINT "scan_review_items_session_id_scan_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."scan_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_review_items" ADD CONSTRAINT "scan_review_items_scan_artifact_id_scan_artifacts_id_fk" FOREIGN KEY ("scan_artifact_id") REFERENCES "public"."scan_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deck_cards_unique_card_role_idx" ON "deck_cards" USING btree ("deck_id","catalog_card_id","role");--> statement-breakpoint
CREATE INDEX "deck_cards_account_game_idx" ON "deck_cards" USING btree ("account_id","game");--> statement-breakpoint
CREATE INDEX "deck_cards_deck_idx" ON "deck_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "decks_account_game_updated_idx" ON "decks" USING btree ("account_id","game","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventories_account_game_idx" ON "inventories" USING btree ("account_id","game");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_cards_unique_printing_idx" ON "inventory_cards" USING btree ("inventory_id","catalog_card_id","finish","condition");--> statement-breakpoint
CREATE INDEX "inventory_cards_account_game_idx" ON "inventory_cards" USING btree ("account_id","game");--> statement-breakpoint
CREATE INDEX "inventory_cards_inventory_position_idx" ON "inventory_cards" USING btree ("inventory_id","spellbook_position");--> statement-breakpoint
CREATE INDEX "inventory_cards_canonical_card_idx" ON "inventory_cards" USING btree ("canonical_card_id");--> statement-breakpoint
CREATE INDEX "scan_artifacts_account_idx" ON "scan_artifacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "scan_artifacts_session_idx" ON "scan_artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scan_review_items_account_idx" ON "scan_review_items" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "scan_review_items_session_idx" ON "scan_review_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "scan_review_items_artifact_idx" ON "scan_review_items" USING btree ("scan_artifact_id");--> statement-breakpoint
CREATE INDEX "scan_sessions_account_game_updated_idx" ON "scan_sessions" USING btree ("account_id","game","updated_at");