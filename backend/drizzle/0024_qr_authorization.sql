CREATE TABLE "qr_authorizations" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approver_account_id" text,
	"approver_session_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_authorizations_kind_check" CHECK ("qr_authorizations"."kind" in ('browser', 'device')),
	CONSTRAINT "qr_authorizations_status_check" CHECK ("qr_authorizations"."status" in ('pending', 'approved', 'denied', 'consumed')),
	CONSTRAINT "qr_authorizations_approver_check" CHECK (("qr_authorizations"."status" = 'pending' and "qr_authorizations"."approver_account_id" is null and "qr_authorizations"."approver_session_hash" is null) or ("qr_authorizations"."status" <> 'pending' and "qr_authorizations"."approver_account_id" is not null and "qr_authorizations"."approver_session_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "qr_authorizations" ADD CONSTRAINT "qr_authorizations_approver_account_id_user_profiles_account_id_fk" FOREIGN KEY ("approver_account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qr_authorizations_expiry_idx" ON "qr_authorizations" USING btree ("expires_at");
