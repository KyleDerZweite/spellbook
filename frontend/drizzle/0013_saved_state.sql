-- Commit-scoped, coarse invalidation. PostgreSQL emits nothing on rollback.
CREATE FUNCTION spellbook_saved_state_notify() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 row_data jsonb;
 owner_id text;
 topic text := TG_ARGV[0];
BEGIN
 row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_NAME = 'user_profiles' AND TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - 'last_seen_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'last_seen_at') THEN
   RETURN NULL;
 END IF;
 owner_id := row_data->>'account_id';
 IF TG_TABLE_NAME = 'inventory_groups' THEN
   SELECT account_id INTO owner_id FROM inventories WHERE id=(row_data->>'inventory_id')::uuid;
 ELSIF TG_TABLE_NAME = 'inventory_group_memberships' THEN
   SELECT i.account_id INTO owner_id FROM inventory_groups g JOIN inventories i ON i.id=g.inventory_id
   WHERE g.id=(row_data->>'group_id')::uuid;
 END IF;
 IF owner_id IS NOT NULL THEN
   PERFORM pg_notify('spellbook_saved_state',json_build_object('accountId',owner_id,'topic',topic)::text);
 END IF;
 IF TG_OP = 'UPDATE' AND row_data->>'account_id' IS DISTINCT FROM to_jsonb(OLD)->>'account_id' AND to_jsonb(OLD)->>'account_id' IS NOT NULL THEN
   PERFORM pg_notify('spellbook_saved_state',json_build_object('accountId',to_jsonb(OLD)->>'account_id','topic',topic)::text);
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER saved_state_profile AFTER INSERT OR UPDATE OR DELETE ON user_profiles FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('profile');
--> statement-breakpoint
CREATE TRIGGER saved_state_auth AFTER INSERT OR UPDATE OR DELETE ON auth_sessions FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('auth');
--> statement-breakpoint
CREATE TRIGGER saved_state_credentials AFTER INSERT OR UPDATE OR DELETE ON local_credentials FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('auth');
--> statement-breakpoint
CREATE TRIGGER saved_state_inventory AFTER INSERT OR UPDATE OR DELETE ON inventories FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('inventory');
--> statement-breakpoint
CREATE TRIGGER saved_state_inventory_cards AFTER INSERT OR UPDATE OR DELETE ON inventory_cards FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('inventory');
--> statement-breakpoint
CREATE TRIGGER saved_state_inventory_groups AFTER INSERT OR UPDATE OR DELETE ON inventory_groups FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('inventory');
--> statement-breakpoint
CREATE TRIGGER saved_state_inventory_memberships AFTER INSERT OR UPDATE OR DELETE ON inventory_group_memberships FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('inventory');
--> statement-breakpoint
CREATE TRIGGER saved_state_decks AFTER INSERT OR UPDATE OR DELETE ON decks FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('decks');
--> statement-breakpoint
CREATE TRIGGER saved_state_deck_cards AFTER INSERT OR UPDATE OR DELETE ON deck_cards FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('decks');
--> statement-breakpoint
CREATE TRIGGER saved_state_scan_sessions AFTER INSERT OR UPDATE OR DELETE ON scan_sessions FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('scan');
--> statement-breakpoint
CREATE TRIGGER saved_state_scan_artifacts AFTER INSERT OR UPDATE OR DELETE ON scan_artifacts FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('scan');
--> statement-breakpoint
CREATE TRIGGER saved_state_scan_review AFTER INSERT OR UPDATE OR DELETE ON scan_review_items FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('scan');
