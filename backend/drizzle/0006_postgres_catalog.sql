CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "catalog_generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "catalog_generations_count_check" CHECK ("catalog_generations"."document_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "catalog_printings" (
	"generation_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"oracle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"printed_name" text NOT NULL,
	"lang" text NOT NULL,
	"set_code" text NOT NULL,
	"collector_number" text NOT NULL,
	"rarity" text NOT NULL,
	"cmc" double precision NOT NULL,
	"colors" text[] NOT NULL,
	"card_types" text[] NOT NULL,
	"legalities" jsonb NOT NULL,
	"search_name" text NOT NULL,
	"search_text" text NOT NULL,
	"document" jsonb NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
	CONSTRAINT "catalog_printings_generation_id_id_pk" PRIMARY KEY("generation_id","id")
);
--> statement-breakpoint
CREATE TABLE "catalog_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"active_generation" uuid,
	"previous_generation" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_state_singleton_check" CHECK ("catalog_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "catalog_printings" ADD CONSTRAINT "catalog_printings_generation_id_catalog_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."catalog_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_state" ADD CONSTRAINT "catalog_state_active_generation_catalog_generations_id_fk" FOREIGN KEY ("active_generation") REFERENCES "public"."catalog_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_state" ADD CONSTRAINT "catalog_state_previous_generation_catalog_generations_id_fk" FOREIGN KEY ("previous_generation") REFERENCES "public"."catalog_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_printings_oracle_idx" ON "catalog_printings" USING btree ("generation_id","oracle_id");--> statement-breakpoint
CREATE INDEX "catalog_printings_name_idx" ON "catalog_printings" USING btree ("generation_id","normalized_name");--> statement-breakpoint
CREATE INDEX "catalog_printings_set_collector_idx" ON "catalog_printings" USING btree ("generation_id","set_code","collector_number");--> statement-breakpoint
CREATE INDEX "catalog_printings_order_idx" ON "catalog_printings" USING btree ("generation_id","name","id");--> statement-breakpoint
CREATE INDEX "catalog_printings_search_name_idx" ON "catalog_printings" USING gin ("search_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "catalog_printings_search_vector_idx" ON "catalog_printings" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "catalog_printings_colors_idx" ON "catalog_printings" USING gin ("colors");--> statement-breakpoint
CREATE INDEX "catalog_printings_card_types_idx" ON "catalog_printings" USING gin ("card_types");--> statement-breakpoint
CREATE INDEX "catalog_printings_legalities_idx" ON "catalog_printings" USING gin ("legalities");
--> statement-breakpoint
INSERT INTO "catalog_state" ("id") VALUES (1);
