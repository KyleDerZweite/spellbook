CREATE TABLE "price_publications" (
 "id" uuid PRIMARY KEY NOT NULL,
 "catalog_generation_id" uuid NOT NULL,
 "descriptor" jsonb NOT NULL,
 "source_type" text NOT NULL,
 "source_updated_at" timestamp with time zone NOT NULL,
 "payload_digest" text NOT NULL,
 "extractor_version" integer NOT NULL,
 "mapping_version" integer NOT NULL,
 "ingested_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_printings" (
 "publication_id" uuid NOT NULL REFERENCES "price_publications"("id") ON DELETE cascade,
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
 PRIMARY KEY ("publication_id", "id")
);
--> statement-breakpoint
CREATE INDEX "price_printings_variant_idx" ON "price_printings" ("publication_id", "variant_key", "lang");
--> statement-breakpoint
CREATE TABLE "price_observations" (
 "publication_id" uuid NOT NULL REFERENCES "price_publications"("id") ON DELETE cascade,
 "printing_id" uuid NOT NULL,
 "finish" text NOT NULL CHECK ("finish" IN ('nonfoil', 'foil')),
 "measure" text NOT NULL,
 "amount" numeric CHECK ("amount" >= 0 AND "amount" != 'NaN'::numeric AND "amount" != 'Infinity'::numeric),
 "raw_value" text,
 "supported" boolean NOT NULL,
 "english_printing_id" uuid,
 "mapping_reason" text,
 PRIMARY KEY ("publication_id", "printing_id", "finish", "measure")
);
--> statement-breakpoint
CREATE TABLE "price_state" (
 "id" integer PRIMARY KEY NOT NULL CHECK ("id" = 1),
 "active_publication" uuid REFERENCES "price_publications"("id"),
 "previous_publication" uuid REFERENCES "price_publications"("id"),
 "refresh_status" jsonb NOT NULL DEFAULT '{"kind":"NeverAttempted"}'::jsonb
);
--> statement-breakpoint
INSERT INTO "price_state" ("id") VALUES (1);
