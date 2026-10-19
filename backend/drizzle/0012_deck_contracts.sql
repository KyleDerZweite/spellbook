ALTER TABLE "deck_mutation_requests" DROP CONSTRAINT "deck_mutation_requests_deck_id_decks_id_fk";
--> statement-breakpoint
ALTER TABLE "deck_mutation_requests" ADD COLUMN "acknowledgement" jsonb;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "description_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "composition_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_mutation_requests" ADD CONSTRAINT "deck_mutation_requests_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;