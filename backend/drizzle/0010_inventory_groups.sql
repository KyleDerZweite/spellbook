CREATE TABLE "inventory_group_memberships" (
	"group_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	CONSTRAINT "inventory_group_memberships_group_id_entry_id_pk" PRIMARY KEY("group_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inventory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_groups_name_check" CHECK ("inventory_groups"."name" = btrim("inventory_groups"."name") and char_length("inventory_groups"."name") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "inventory_group_memberships" ADD CONSTRAINT "inventory_group_memberships_group_id_inventory_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."inventory_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_group_memberships" ADD CONSTRAINT "inventory_group_memberships_entry_id_inventory_cards_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."inventory_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_groups" ADD CONSTRAINT "inventory_groups_inventory_id_inventories_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_group_memberships_entry_idx" ON "inventory_group_memberships" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_groups_inventory_name_idx" ON "inventory_groups" USING btree ("inventory_id",lower("name"));