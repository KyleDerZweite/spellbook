CREATE TABLE "deck_library_state" (
	"account_id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "deck_library_revision_check" CHECK ("deck_library_state"."revision">=0)
);
--> statement-breakpoint
CREATE TABLE "deck_whole_categories" (
	"deck_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"origin_id" uuid NOT NULL,
	"definition_snapshot" jsonb NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"suppressed" boolean DEFAULT false NOT NULL,
	"automatic_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "deck_whole_categories_deck_id_version_id_pk" PRIMARY KEY("deck_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "deck_whole_category_decisions" (
	"deck_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"state" text NOT NULL,
	"manual" text,
	"truth" text,
	"attempted_truth" text,
	"revision" bigint DEFAULT 1 NOT NULL,
	"evidence" jsonb,
	"previous_evaluation" jsonb,
	CONSTRAINT "deck_whole_category_decisions_deck_id_version_id_pk" PRIMARY KEY("deck_id","version_id"),
	CONSTRAINT "whole_category_state_check" CHECK ("deck_whole_category_decisions"."state" IN ('Automatic','Pending','Manual')),
	CONSTRAINT "whole_category_manual_check" CHECK ("deck_whole_category_decisions"."manual" IS NULL OR "deck_whole_category_decisions"."manual" IN ('Include','Exclude')),
	CONSTRAINT "whole_category_truth_check" CHECK ("deck_whole_category_decisions"."truth" IS NULL OR "deck_whole_category_decisions"."truth" IN ('True','False')),
	CONSTRAINT "whole_category_attempt_check" CHECK ("deck_whole_category_decisions"."attempted_truth" IS NULL OR "deck_whole_category_decisions"."attempted_truth" IN ('True','False','Unknown')),
	CONSTRAINT "whole_category_revision_check" CHECK ("deck_whole_category_decisions"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "deck_whole_category_jobs" (
	"deck_id" uuid PRIMARY KEY NOT NULL,
	"generation" bigint NOT NULL,
	"composition_revision" bigint NOT NULL,
	"decision_revision" bigint NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	CONSTRAINT "whole_category_job_generation_check" CHECK ("deck_whole_category_jobs"."generation">0),
	CONSTRAINT "whole_category_job_attempts_check" CHECK ("deck_whole_category_jobs"."attempts">=0)
);
--> statement-breakpoint
ALTER TABLE "deck_library_state" ADD CONSTRAINT "deck_library_state_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_whole_categories" ADD CONSTRAINT "deck_whole_categories_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_whole_category_decisions" ADD CONSTRAINT "deck_whole_category_decisions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_whole_category_decisions" ADD CONSTRAINT "deck_whole_category_decisions_deck_id_version_id_deck_whole_categories_deck_id_version_id_fk" FOREIGN KEY ("deck_id","version_id") REFERENCES "public"."deck_whole_categories"("deck_id","version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_whole_category_jobs" ADD CONSTRAINT "deck_whole_category_jobs_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_whole_categories_version_idx" ON "deck_whole_categories" USING btree ("version_id","deck_id");--> statement-breakpoint
CREATE INDEX "whole_category_job_due_idx" ON "deck_whole_category_jobs" USING btree ("available_at","deck_id");--> statement-breakpoint
INSERT INTO deck_whole_categories(deck_id,version_id,origin_id,definition_snapshot,name,display_order)
SELECT b.deck_id,(v->>'id')::uuid,(v->>'originId')::uuid,v,v->>'name',(v->>'displayOrder')::integer
FROM deck_category_bundles b CROSS JOIN LATERAL jsonb_array_elements(b.whole_deck_definitions) v;
--> statement-breakpoint
INSERT INTO deck_whole_category_jobs(deck_id,generation,composition_revision,decision_revision,available_at)
SELECT b.deck_id,1,d.composition_revision,b.decision_revision,clock_timestamp()
FROM deck_category_bundles b JOIN decks d ON d.id=b.deck_id;
