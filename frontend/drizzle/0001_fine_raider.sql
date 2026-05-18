CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_type" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email_at_login" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_idx" ON "auth_identities" USING btree ("provider_type","issuer","subject");--> statement-breakpoint
CREATE INDEX "auth_identities_account_idx" ON "auth_identities" USING btree ("account_id");