CREATE TABLE "optional_price_observations" (
	"publication_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"finish" text NOT NULL,
	"measure" text NOT NULL,
	"amount" numeric,
	"raw_value" text,
	"supported" boolean NOT NULL,
	"provider_id" text,
	"english_printing_id" uuid,
	"mapping_reason" text,
	CONSTRAINT "optional_price_observations_publication_id_printing_id_finish_pk" PRIMARY KEY("publication_id","printing_id","finish"),
	CONSTRAINT "optional_price_observations_finish_check" CHECK ("optional_price_observations"."finish" in ('nonfoil','foil')),
	CONSTRAINT "optional_price_observations_amount_check" CHECK ("optional_price_observations"."amount" >= 0 AND "optional_price_observations"."amount" NOT IN ('NaN'::numeric,'Infinity'::numeric))
);
--> statement-breakpoint
CREATE TABLE "optional_price_printings" (
	"publication_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"identity" jsonb NOT NULL,
	"finishes" text[] NOT NULL,
	"variant_key" text,
	CONSTRAINT "optional_price_printings_publication_id_printing_id_pk" PRIMARY KEY("publication_id","printing_id")
);
--> statement-breakpoint
CREATE TABLE "optional_price_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"time_precision" text NOT NULL,
	"source_instant" timestamp with time zone,
	"source_date" date,
	"descriptor" jsonb NOT NULL,
	"payload_digest" text NOT NULL,
	"extractor_version" integer NOT NULL,
	"mapping_version" integer NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "optional_price_publications_source_check" CHECK ("optional_price_publications"."source" in ('Cardmarket','MTGJSON')),
	CONSTRAINT "optional_price_publications_time_precision_check" CHECK ("optional_price_publications"."time_precision" in ('Instant','Day')),
	CONSTRAINT "optional_price_publications_time_check" CHECK (("optional_price_publications"."time_precision"='Instant' AND "optional_price_publications"."source_instant" IS NOT NULL AND "optional_price_publications"."source_date" IS NULL) OR ("optional_price_publications"."time_precision"='Day' AND "optional_price_publications"."source_date" IS NOT NULL AND "optional_price_publications"."source_instant" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "optional_price_state" (
	"source" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"active_publication" uuid,
	"previous_publication" uuid,
	"refresh_status" jsonb DEFAULT '{"kind":"NeverAttempted"}'::jsonb NOT NULL,
	CONSTRAINT "optional_price_state_source_check" CHECK ("optional_price_state"."source" in ('Cardmarket','MTGJSON'))
);
--> statement-breakpoint
CREATE TABLE "price_history_days" (
	"source" text NOT NULL,
	"day" date NOT NULL,
	"source_instant" timestamp with time zone,
	"publication_id" uuid NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_history_days_source_day_pk" PRIMARY KEY("source","day"),
	CONSTRAINT "price_history_days_source_check" CHECK ("price_history_days"."source" in ('Scryfall','Cardmarket','MTGJSON'))
);
--> statement-breakpoint
CREATE TABLE "price_history_printings" (
	"publication_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"identity" jsonb NOT NULL,
	"variant_key" text,
	CONSTRAINT "price_history_printings_publication_id_printing_id_pk" PRIMARY KEY("publication_id","printing_id")
);
--> statement-breakpoint
CREATE TABLE "price_history_publications" (
	"publication_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "price_history_publications_source_check" CHECK ("price_history_publications"."source" in ('Scryfall','Cardmarket','MTGJSON'))
);
--> statement-breakpoint
CREATE TABLE "price_source_history" (
	"source" text NOT NULL,
	"printing_id" uuid NOT NULL,
	"finish" text NOT NULL,
	"day" date NOT NULL,
	"time_precision" text NOT NULL,
	"source_instant" timestamp with time zone,
	"amount" numeric NOT NULL,
	"measure" text NOT NULL,
	"raw_value" text,
	"provider_id" text,
	"publication_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "price_source_history_source_printing_id_finish_day_pk" PRIMARY KEY("source","printing_id","finish","day"),
	CONSTRAINT "price_source_history_source_check" CHECK ("price_source_history"."source" in ('Scryfall','Cardmarket','MTGJSON')),
	CONSTRAINT "price_source_history_finish_check" CHECK ("price_source_history"."finish" in ('nonfoil','foil')),
	CONSTRAINT "price_source_history_time_precision_check" CHECK ("price_source_history"."time_precision" in ('Instant','Day')),
	CONSTRAINT "price_source_history_amount_check" CHECK ("price_source_history"."amount" >= 0 AND "price_source_history"."amount" NOT IN ('NaN'::numeric,'Infinity'::numeric)),
	CONSTRAINT "price_source_history_time_check" CHECK (("price_source_history"."time_precision"='Instant' AND "price_source_history"."source_instant" IS NOT NULL) OR ("price_source_history"."time_precision"='Day' AND "price_source_history"."source_instant" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "optional_price_observations" ADD CONSTRAINT "optional_price_observations_publication_id_optional_price_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."optional_price_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optional_price_printings" ADD CONSTRAINT "optional_price_printings_publication_id_optional_price_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."optional_price_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optional_price_state" ADD CONSTRAINT "optional_price_state_active_publication_optional_price_publications_id_fk" FOREIGN KEY ("active_publication") REFERENCES "public"."optional_price_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optional_price_state" ADD CONSTRAINT "optional_price_state_previous_publication_optional_price_publications_id_fk" FOREIGN KEY ("previous_publication") REFERENCES "public"."optional_price_publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history_printings" ADD CONSTRAINT "price_history_printings_publication_id_price_history_publications_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."price_history_publications"("publication_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_source_history_window" ON "price_source_history" USING btree ("printing_id","finish","day","source");--> statement-breakpoint
CREATE INDEX "price_source_history_publication" ON "price_source_history" USING btree ("source","publication_id");
--> statement-breakpoint
INSERT INTO "optional_price_state" ("source") VALUES ('Cardmarket'), ('MTGJSON');
