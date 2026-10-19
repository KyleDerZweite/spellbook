ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_role_check" CHECK ("deck_cards"."role" in ('main', 'sideboard', 'commander', 'companion'));--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_game_check" CHECK ("deck_cards"."game" in ('mtg'));--> statement-breakpoint
ALTER TABLE "deck_mutation_requests" ADD CONSTRAINT "deck_mutation_requests_source_check" CHECK ("deck_mutation_requests"."source" in ('mobile', 'web', 'import'));--> statement-breakpoint
ALTER TABLE "deck_mutation_requests" ADD CONSTRAINT "deck_mutation_requests_status_check" CHECK ("deck_mutation_requests"."status" in ('applied', 'pending', 'rejected'));--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_game_check" CHECK ("decks"."game" in ('mtg'));--> statement-breakpoint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_game_check" CHECK ("inventories"."game" in ('mtg'));--> statement-breakpoint
ALTER TABLE "inventory_mutation_requests" ADD CONSTRAINT "inventory_mutation_requests_source_check" CHECK ("inventory_mutation_requests"."source" in ('mobile', 'web', 'import', 'scan', 'scan_review'));--> statement-breakpoint
ALTER TABLE "inventory_mutation_requests" ADD CONSTRAINT "inventory_mutation_requests_status_check" CHECK ("inventory_mutation_requests"."status" in ('applied', 'pending', 'rejected'));--> statement-breakpoint
ALTER TABLE "scan_artifacts" ADD CONSTRAINT "scan_artifacts_status_check" CHECK ("scan_artifacts"."status" in ('matched', 'ambiguous', 'no_match', 'failed'));--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_game_check" CHECK ("scan_sessions"."game" in ('mtg'));--> statement-breakpoint
ALTER TABLE "scan_sessions" ADD CONSTRAINT "scan_sessions_status_check" CHECK ("scan_sessions"."status" in ('open', 'pending_review', 'committed', 'cancelled'));