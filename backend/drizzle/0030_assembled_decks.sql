ALTER TABLE decks ADD COLUMN assembled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX decks_account_assembled_idx ON decks (account_id, game) WHERE assembled;
