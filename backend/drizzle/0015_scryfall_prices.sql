CREATE TABLE "price_observations" (
	"publication_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"finish" text NOT NULL,
	"measure" text NOT NULL,
	"amount" numeric,
	"raw_value" text,
	"supported" boolean NOT NULL,
	"english_printing_id" uuid,
	"mapping_reason" text,
	CONSTRAINT "price_observations_publication_id_printing_id_finish_measure_pk" PRIMARY KEY("publication_id","printing_id","finish","measure"),
	CONSTRAINT "price_observations_finish_check" CHECK ("price_observations"."finish" in ('nonfoil','foil')),
	CONSTRAINT "price_observations_amount_check" CHECK ("price_observations"."amount" >= 0 AND "price_observations"."amount" != 'NaN'::numeric AND "price_observations"."amount" != 'Infinity'::numeric)
);
--> statement-breakpoint
CREATE TABLE "price_printings" (
	"publication_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"oracle_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"set_code" text NOT NULL,
	"collector_number" text NOT NULL,
	"lang" text NOT NULL,
	"finishes" text[] NOT NULL,
	"variant_key" text,
	"identity" jsonb NOT NULL,
	"links" jsonb NOT NULL,
	CONSTRAINT "price_printings_publication_id_id_pk" PRIMARY KEY("publication_id","id")
);
--> statement-breakpoint
CREATE TABLE "price_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"catalog_generation_id" uuid NOT NULL,
	"descriptor" jsonb NOT NULL,
	"source_type" text NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"payload_digest" text NOT NULL,
	"extractor_version" integer NOT NULL,
	"mapping_version" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"active_publication" uuid,
	"previous_publication" uuid,
	"refresh_status" jsonb DEFAULT '{"kind":"NeverAttempted"}'::jsonb NOT NULL,
	CONSTRAINT "price_state_id_check" CHECK ("price_state"."id"=1)
);
--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_publication_id_price_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."price_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_printings" ADD CONSTRAINT "price_printings_publication_id_price_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."price_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_state" ADD CONSTRAINT "price_state_active_publication_price_publications_id_fk" FOREIGN KEY ("active_publication") REFERENCES "public"."price_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_state" ADD CONSTRAINT "price_state_previous_publication_price_publications_id_fk" FOREIGN KEY ("previous_publication") REFERENCES "public"."price_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_printings_variant_idx" ON "price_printings" USING btree ("publication_id","variant_key","lang");
--> statement-breakpoint
INSERT INTO "price_state" ("id") VALUES (1);
