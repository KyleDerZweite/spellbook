CREATE TABLE "category_change_previews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"deck_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"mode" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"difference_total" integer DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"plan" jsonb,
	"acknowledgement" jsonb,
	CONSTRAINT "category_preview_scope_check" CHECK ("category_change_previews"."scope" IN ('entry','deck')),
	CONSTRAINT "category_preview_mode_check" CHECK ("category_change_previews"."mode" IN ('Review','Reset'))
);
--> statement-breakpoint
CREATE TABLE "category_definition_origins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"scope" text NOT NULL,
	"current_version" integer NOT NULL,
	"normalized_name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "category_origin_scope_check" CHECK ("category_definition_origins"."scope" IN ('entry','deck')),
	CONSTRAINT "category_origin_version_check" CHECK ("category_definition_origins"."current_version">0)
);
--> statement-breakpoint
CREATE TABLE "category_definition_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"origin_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	CONSTRAINT "category_version_positive" CHECK ("category_definition_versions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "category_library_state" (
	"account_id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "category_library_revision_check" CHECK ("category_library_state"."revision">=0)
);
--> statement-breakpoint
CREATE TABLE "category_preview_differences" (
	"preview_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"difference" jsonb NOT NULL,
	CONSTRAINT "category_preview_differences_preview_id_position_pk" PRIMARY KEY("preview_id","position")
);
--> statement-breakpoint
ALTER TABLE "catalog_oracle_facts" ADD COLUMN "keywords" text[];--> statement-breakpoint
ALTER TABLE "deck_category_bundles" ADD COLUMN "whole_deck_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_category_bundles" ADD COLUMN "library_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_category_bundles" ADD COLUMN "suppressed_origins" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_entry_category_decisions" ADD COLUMN "definition_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "deck_entry_category_decisions" ADD COLUMN "previous_evaluation" jsonb;--> statement-breakpoint
ALTER TABLE "category_change_previews" ADD CONSTRAINT "category_change_previews_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_definition_origins" ADD CONSTRAINT "category_definition_origins_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_definition_versions" ADD CONSTRAINT "category_definition_versions_origin_id_category_definition_origins_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."category_definition_origins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_library_state" ADD CONSTRAINT "category_library_state_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_preview_differences" ADD CONSTRAINT "category_preview_differences_preview_id_category_change_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."category_change_previews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_preview_request_unique" ON "category_change_previews" USING btree ("account_id","request_id");--> statement-breakpoint
CREATE INDEX "category_preview_capacity_idx" ON "category_change_previews" USING btree ("account_id","expires_at");--> statement-breakpoint
CREATE INDEX "category_preview_cleanup_idx" ON "category_change_previews" USING btree ("account_id","expires_at","id") WHERE "category_change_previews"."plan" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "category_active_name_unique" ON "category_definition_origins" USING btree ("account_id","scope","normalized_name") WHERE NOT "category_definition_origins"."archived";--> statement-breakpoint
CREATE UNIQUE INDEX "category_definition_version_unique" ON "category_definition_versions" USING btree ("origin_id","version");
--> statement-breakpoint
-- Reusable meaning and ownership stay immutable after publication.
CREATE FUNCTION guard_category_definition_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.scope IS DISTINCT FROM OLD.scope THEN
  RAISE EXCEPTION 'Category definition identity and scope are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER category_definition_origin_identity BEFORE UPDATE ON category_definition_origins FOR EACH ROW EXECUTE FUNCTION guard_category_definition_origin();
--> statement-breakpoint
CREATE FUNCTION guard_category_definition_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  RAISE EXCEPTION 'Category definition versions are immutable' USING ERRCODE='23514';
 END IF;
 IF NEW.definition->>'id' IS DISTINCT FROM NEW.id::text OR NEW.definition->>'originId' IS DISTINCT FROM NEW.origin_id::text
  OR NEW.definition->>'version' IS DISTINCT FROM NEW.version::text
  OR NEW.definition->>'scope' IS DISTINCT FROM (SELECT scope FROM category_definition_origins WHERE id=NEW.origin_id) THEN
  RAISE EXCEPTION 'Category definition snapshot identity mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER category_definition_version_snapshot BEFORE INSERT OR UPDATE ON category_definition_versions FOR EACH ROW EXECUTE FUNCTION guard_category_definition_version();
