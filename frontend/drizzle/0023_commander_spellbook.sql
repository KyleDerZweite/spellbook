CREATE TABLE "combo_outcomes" (
	"publication_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"uncountable" boolean NOT NULL,
	CONSTRAINT "combo_outcomes_publication_id_id_pk" PRIMARY KEY("publication_id","id"),
	CONSTRAINT "combo_outcomes_id_check" CHECK ("combo_outcomes"."id" ~ '^[1-9][0-9]{0,19}$')
);
--> statement-breakpoint
CREATE TABLE "combo_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"descriptor" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"source_version" text NOT NULL,
	"payload_digest" text NOT NULL,
	"decoded_digest" text NOT NULL,
	"parser_version" integer NOT NULL,
	"policy_version" text NOT NULL,
	"variant_count" integer NOT NULL,
	"outcome_count" integer NOT NULL,
	"alias_count" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combo_publications_counts_check" CHECK ("combo_publications"."variant_count" >= 0 and "combo_publications"."outcome_count" >= 0 and "combo_publications"."alias_count" >= 0),
	CONSTRAINT "combo_publications_policy_check" CHECK ("combo_publications"."parser_version" > 0 and "combo_publications"."policy_version" = 'ingredients-v1')
);
--> statement-breakpoint
CREATE TABLE "combo_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"active_publication" uuid,
	"previous_publication" uuid,
	"refresh_status" jsonb DEFAULT '{"kind":"NeverAttempted"}'::jsonb NOT NULL,
	CONSTRAINT "combo_state_id_check" CHECK ("combo_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "combo_variant_ingredients" (
	"publication_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"position" integer NOT NULL,
	"oracle_id" uuid,
	"quantity" numeric(100, 0) NOT NULL,
	"must_be_commander" boolean NOT NULL,
	CONSTRAINT "combo_variant_ingredients_publication_id_variant_id_position_pk" PRIMARY KEY("publication_id","variant_id","position"),
	CONSTRAINT "combo_variant_ingredients_quantity_check" CHECK ("combo_variant_ingredients"."quantity" > 0 and "combo_variant_ingredients"."quantity" <> 'NaN'::numeric),
	CONSTRAINT "combo_variant_ingredients_position_check" CHECK ("combo_variant_ingredients"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "combo_variant_outcomes" (
	"publication_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"quantity" numeric(100, 0) NOT NULL,
	CONSTRAINT "combo_variant_outcomes_publication_id_variant_id_outcome_id_pk" PRIMARY KEY("publication_id","variant_id","outcome_id"),
	CONSTRAINT "combo_variant_outcomes_quantity_check" CHECK ("combo_variant_outcomes"."quantity" > 0 and "combo_variant_outcomes"."quantity" <> 'NaN'::numeric)
);
--> statement-breakpoint
CREATE TABLE "combo_variants" (
	"publication_id" uuid NOT NULL,
	"id" text NOT NULL,
	"document" jsonb NOT NULL,
	CONSTRAINT "combo_variants_publication_id_id_pk" PRIMARY KEY("publication_id","id"),
	CONSTRAINT "combo_variants_id_check" CHECK (char_length("combo_variants"."id") between 1 and 128)
);
--> statement-breakpoint
ALTER TABLE "combo_outcomes" ADD CONSTRAINT "combo_outcomes_publication_id_combo_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."combo_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_state" ADD CONSTRAINT "combo_state_active_publication_combo_publications_id_fk" FOREIGN KEY ("active_publication") REFERENCES "public"."combo_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_state" ADD CONSTRAINT "combo_state_previous_publication_combo_publications_id_fk" FOREIGN KEY ("previous_publication") REFERENCES "public"."combo_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variant_ingredients" ADD CONSTRAINT "combo_variant_ingredients_publication_id_variant_id_combo_variants_publication_id_id_fk" FOREIGN KEY ("publication_id","variant_id") REFERENCES "public"."combo_variants"("publication_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variant_outcomes" ADD CONSTRAINT "combo_variant_outcomes_publication_id_variant_id_combo_variants_publication_id_id_fk" FOREIGN KEY ("publication_id","variant_id") REFERENCES "public"."combo_variants"("publication_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variant_outcomes" ADD CONSTRAINT "combo_variant_outcomes_publication_id_outcome_id_combo_outcomes_publication_id_id_fk" FOREIGN KEY ("publication_id","outcome_id") REFERENCES "public"."combo_outcomes"("publication_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_variants" ADD CONSTRAINT "combo_variants_publication_id_combo_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."combo_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combo_outcomes_name_idx" ON "combo_outcomes" USING btree ("publication_id","name","id");--> statement-breakpoint
CREATE INDEX "combo_variant_ingredients_oracle_idx" ON "combo_variant_ingredients" USING btree ("publication_id","oracle_id","variant_id");--> statement-breakpoint
CREATE INDEX "combo_variant_outcomes_outcome_idx" ON "combo_variant_outcomes" USING btree ("publication_id","outcome_id","variant_id");