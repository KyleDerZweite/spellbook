ALTER TABLE "inventory_value_days" ADD COLUMN "deck_count" bigint;
--> statement-breakpoint
ALTER TABLE "inventory_value_days" ADD CONSTRAINT "inventory_value_days_deck_count_check" CHECK ("deck_count" >= 0 AND "deck_count" <= 9007199254740991);
