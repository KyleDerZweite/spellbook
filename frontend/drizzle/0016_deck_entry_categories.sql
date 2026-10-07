CREATE TABLE "catalog_oracle_facts" (
	"generation_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"raw_oracle_id" uuid,
	"types" text[],
	"transform_version" integer NOT NULL,
	CONSTRAINT "catalog_oracle_facts_generation_id_printing_id_pk" PRIMARY KEY("generation_id","printing_id")
);
--> statement-breakpoint
CREATE TABLE "category_mutation_requests" (
	"account_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"acknowledgement" jsonb NOT NULL,
	CONSTRAINT "category_mutation_requests_account_id_request_id_pk" PRIMARY KEY("account_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "deck_category_bundles" (
	"deck_id" uuid PRIMARY KEY NOT NULL,
	"definitions" jsonb NOT NULL,
	"decision_revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "deck_category_bundles_revision_check" CHECK ("deck_category_bundles"."decision_revision">=0)
);
--> statement-breakpoint
CREATE TABLE "deck_entry_category_decisions" (
	"entry_id" uuid PRIMARY KEY NOT NULL,
	"deck_id" uuid NOT NULL,
	"category_id" uuid,
	"state" text NOT NULL,
	"revision" bigint DEFAULT 1 NOT NULL,
	"evidence" jsonb,
	CONSTRAINT "deck_entry_category_decisions_state_check" CHECK ("deck_entry_category_decisions"."state" in ('Automatic','Manual','Pending')),
	CONSTRAINT "deck_entry_category_decisions_revision_check" CHECK ("deck_entry_category_decisions"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "oracle_tag_closure" (
	"publication_id" uuid NOT NULL,
	"ancestor_id" uuid NOT NULL,
	"descendant_id" uuid NOT NULL,
	CONSTRAINT "oracle_tag_closure_publication_id_ancestor_id_descendant_id_pk" PRIMARY KEY("publication_id","ancestor_id","descendant_id")
);
--> statement-breakpoint
CREATE TABLE "oracle_tag_memberships" (
	"publication_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"oracle_id" uuid NOT NULL,
	"weight" text NOT NULL,
	CONSTRAINT "oracle_tag_memberships_publication_id_tag_id_oracle_id_pk" PRIMARY KEY("publication_id","tag_id","oracle_id")
);
--> statement-breakpoint
CREATE TABLE "oracle_tag_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"descriptor" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"payload_digest" text NOT NULL,
	"parser_version" integer NOT NULL,
	"mapping_version" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oracle_tag_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"active_publication" uuid,
	"previous_publication" uuid,
	"refresh_status" jsonb DEFAULT '{"kind":"NeverAttempted"}'::jsonb NOT NULL,
	CONSTRAINT "oracle_tag_state_id_check" CHECK ("oracle_tag_state"."id"=1)
);
--> statement-breakpoint
CREATE TABLE "oracle_tags" (
	"publication_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "oracle_tags_publication_id_id_pk" PRIMARY KEY("publication_id","id")
);
--> statement-breakpoint
ALTER TABLE "catalog_oracle_facts" ADD CONSTRAINT "catalog_oracle_facts_generation_id_catalog_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."catalog_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_mutation_requests" ADD CONSTRAINT "category_mutation_requests_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_category_bundles" ADD CONSTRAINT "deck_category_bundles_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_entry_category_decisions" ADD CONSTRAINT "deck_entry_category_decisions_entry_id_deck_cards_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."deck_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_entry_category_decisions" ADD CONSTRAINT "deck_entry_category_decisions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_tag_closure" ADD CONSTRAINT "oracle_tag_closure_publication_id_oracle_tag_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."oracle_tag_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_tag_memberships" ADD CONSTRAINT "oracle_tag_memberships_publication_id_oracle_tag_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."oracle_tag_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_tag_state" ADD CONSTRAINT "oracle_tag_state_active_publication_oracle_tag_publications_id_fk" FOREIGN KEY ("active_publication") REFERENCES "public"."oracle_tag_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_tag_state" ADD CONSTRAINT "oracle_tag_state_previous_publication_oracle_tag_publications_id_fk" FOREIGN KEY ("previous_publication") REFERENCES "public"."oracle_tag_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oracle_tags" ADD CONSTRAINT "oracle_tags_publication_id_oracle_tag_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."oracle_tag_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_entry_category_decisions_deck_idx" ON "deck_entry_category_decisions" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "oracle_tag_memberships_card_idx" ON "oracle_tag_memberships" USING btree ("publication_id","oracle_id","tag_id");--> statement-breakpoint
INSERT INTO "oracle_tag_state" ("id") VALUES (1);
