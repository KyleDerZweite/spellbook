-- Linked device sessions: self-reported QR device metadata and device-bound session identity.
ALTER TABLE "qr_authorizations" ADD COLUMN "device_name" text;
--> statement-breakpoint
ALTER TABLE "qr_authorizations" ADD COLUMN "device_type" text;
--> statement-breakpoint
ALTER TABLE "qr_authorizations" ADD CONSTRAINT "qr_authorizations_device_type_check" CHECK ("qr_authorizations"."device_type" in ('cardstation', 'scanner', 'other'));
--> statement-breakpoint
ALTER TABLE "qr_authorizations" ADD CONSTRAINT "qr_authorizations_device_metadata_check" CHECK ("qr_authorizations"."kind" = 'device' or ("qr_authorizations"."device_name" is null and "qr_authorizations"."device_type" is null));
--> statement-breakpoint
-- Pre-migration device requests were approved without in-person confirmation; expire any still open.
UPDATE "qr_authorizations" SET "expires_at" = now() - interval '1 second' WHERE "kind" = 'device' AND "status" IN ('pending', 'approved') AND "expires_at" > now();
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "device_id" uuid;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "device_name" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "device_type" text;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "last_seen_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_device_type_check" CHECK ("auth_sessions"."device_type" in ('cardstation', 'scanner', 'other'));
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_device_check" CHECK (("auth_sessions"."device_id" is null and "auth_sessions"."device_name" is null and "auth_sessions"."device_type" is null and "auth_sessions"."last_seen_at" is null) or ("auth_sessions"."device_id" is not null and "auth_sessions"."last_seen_at" is not null));
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_device_idx" ON "auth_sessions" USING btree ("device_id") WHERE "auth_sessions"."device_id" is not null;
--> statement-breakpoint
-- Renewal and rename touch only expires_at, last_seen_at or device_name and must not revalidate
-- the account's SavedState streams. Inserts, deletes (revocation) and other updates still notify.
DROP TRIGGER "saved_state_auth" ON "auth_sessions";
--> statement-breakpoint
CREATE TRIGGER saved_state_auth AFTER INSERT OR DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('auth');
--> statement-breakpoint
CREATE TRIGGER saved_state_auth_update AFTER UPDATE ON auth_sessions FOR EACH ROW WHEN ((to_jsonb(NEW) - 'expires_at' - 'last_seen_at' - 'device_name') IS DISTINCT FROM (to_jsonb(OLD) - 'expires_at' - 'last_seen_at' - 'device_name')) EXECUTE FUNCTION spellbook_saved_state_notify('auth');
