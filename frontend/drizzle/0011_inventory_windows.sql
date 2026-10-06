ALTER TABLE "inventories" ADD COLUMN "revision" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_cards" ADD COLUMN "notes_revision" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE COLLATION "inventory_root" (provider = icu, locale = 'und', deterministic = true);
--> statement-breakpoint
DO $$
DECLARE actual text[]; version text;
BEGIN
 SELECT array_agg(value ORDER BY value COLLATE "inventory_root") INTO actual
 FROM unnest(ARRAY['10','100_','100%','2','A B','A-B','AB','aether','Aether','Æther','Angel','Ángel','Eclair','éclair','Other','Öther','卡牌','土地']) value;
 IF actual <> ARRAY['10','100_','100%','2','A B','A-B','AB','aether','Aether','Æther','Angel','Ángel','Eclair','éclair','Other','Öther','卡牌','土地'] THEN
  RAISE EXCEPTION 'Inventory ICU root ordering differs from accepted examples: %', actual;
 END IF;
 SELECT pg_collation_actual_version(oid) INTO version FROM pg_collation WHERE collname='inventory_root' AND collprovider='i';
 IF version IS NULL THEN RAISE EXCEPTION 'Inventory ICU collation unavailable'; END IF;
 RAISE NOTICE 'Inventory ICU root actual version: %',version;
END $$;

--> statement-breakpoint
CREATE INDEX "inventory_cards_window_name_idx" ON "inventory_cards" USING btree ("inventory_id","name" COLLATE "inventory_root","set_code" COLLATE "inventory_root");