CREATE TABLE "inventory_value_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"game" text NOT NULL,
	"day" date NOT NULL,
	"timezone" text NOT NULL,
	"day_start" timestamp with time zone NOT NULL,
	"day_end" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"inventory_revision" bigint DEFAULT '0' NOT NULL,
	"policy_version" text DEFAULT 'daily-final-minute-v1' NOT NULL,
	"estimate" jsonb NOT NULL,
	CONSTRAINT "inventory_value_days_game_check" CHECK ("inventory_value_days"."game" = 'mtg'),
	CONSTRAINT "inventory_value_days_observation_check" CHECK ("inventory_value_days"."observed_at" >= "inventory_value_days"."day_end" - interval '60 seconds' and "inventory_value_days"."observed_at" < "inventory_value_days"."day_end" and "inventory_value_days"."day_start" < "inventory_value_days"."day_end")
);
--> statement-breakpoint
CREATE TABLE "inventory_value_holdings" (
	"day_id" uuid NOT NULL,
	"printing_id" text NOT NULL,
	"finish" text NOT NULL,
	"condition" text NOT NULL,
	"canonical_card_id" text NOT NULL,
	"name" text NOT NULL,
	"set_code" text NOT NULL,
	"image_uri" text NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "inventory_value_holdings_day_id_printing_id_finish_condition_pk" PRIMARY KEY("day_id","printing_id","finish","condition"),
	CONSTRAINT "inventory_value_holdings_quantity_check" CHECK ("inventory_value_holdings"."quantity" > 0),
	CONSTRAINT "inventory_value_holdings_finish_check" CHECK ("inventory_value_holdings"."finish" in ('nonfoil','foil')),
	CONSTRAINT "inventory_value_holdings_condition_check" CHECK ("inventory_value_holdings"."condition" in ('NM','LP','MP','HP','DMG'))
);
--> statement-breakpoint
CREATE TABLE "inventory_value_references" (
	"day_id" uuid NOT NULL,
	"printing_id" text NOT NULL,
	"finish" text NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "inventory_value_references_day_id_printing_id_finish_pk" PRIMARY KEY("day_id","printing_id","finish"),
	CONSTRAINT "inventory_value_references_finish_check" CHECK ("inventory_value_references"."finish" in ('nonfoil','foil'))
);
--> statement-breakpoint
ALTER TABLE "inventory_value_days" ADD CONSTRAINT "inventory_value_days_account_id_user_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user_profiles"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_value_holdings" ADD CONSTRAINT "inventory_value_holdings_day_id_inventory_value_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."inventory_value_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_value_references" ADD CONSTRAINT "inventory_value_references_day_id_inventory_value_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."inventory_value_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_value_days_owner_date_idx" ON "inventory_value_days" USING btree ("account_id","game","day");--> statement-breakpoint
CREATE TRIGGER saved_state_inventory_values AFTER INSERT OR UPDATE OR DELETE ON inventory_value_days FOR EACH ROW EXECUTE FUNCTION spellbook_saved_state_notify('values');
--> statement-breakpoint
CREATE FUNCTION spellbook_public_values_notify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND to_jsonb(NEW) IS NOT DISTINCT FROM to_jsonb(OLD) THEN RETURN NULL; END IF;
 PERFORM pg_notify('spellbook_saved_state','{"public":true,"topic":"values"}');
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER saved_state_public_prices AFTER INSERT OR UPDATE OR DELETE ON price_state FOR EACH ROW EXECUTE FUNCTION spellbook_public_values_notify();
--> statement-breakpoint
CREATE TRIGGER saved_state_optional_prices AFTER INSERT OR UPDATE OR DELETE ON optional_price_state FOR EACH ROW EXECUTE FUNCTION spellbook_public_values_notify();
