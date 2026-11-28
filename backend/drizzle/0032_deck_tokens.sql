ALTER TABLE decks ADD COLUMN auto_refresh_tokens boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE decks ADD COLUMN deck_tokens jsonb;
