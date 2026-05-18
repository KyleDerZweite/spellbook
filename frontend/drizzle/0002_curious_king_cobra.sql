CREATE TABLE "deck_mutation_requests" (
	"account_id" text NOT NULL,
	"request_id" text NOT NULL,
	"deck_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_mutation_requests_account_id_request_id_pk" PRIMARY KEY("account_id","request_id")
);
--> statement-breakpoint
ALTER TABLE "deck_mutation_requests" ADD CONSTRAINT "deck_mutation_requests_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;