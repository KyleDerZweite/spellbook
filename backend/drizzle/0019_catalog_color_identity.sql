ALTER TABLE "catalog_printings" ADD COLUMN "color_identity_mask" smallint GENERATED ALWAYS AS (CASE WHEN document->'color_identity' <@ '["W","U","B","R","G"]'::jsonb THEN
				CASE WHEN document->'color_identity' @> '"W"'::jsonb THEN 1 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"U"'::jsonb THEN 2 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"B"'::jsonb THEN 4 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"R"'::jsonb THEN 8 ELSE 0 END +
				CASE WHEN document->'color_identity' @> '"G"'::jsonb THEN 16 ELSE 0 END
				ELSE NULL END) STORED;--> statement-breakpoint
CREATE INDEX "catalog_printings_color_identity_idx" ON "catalog_printings" USING btree ("generation_id","color_identity_mask");
--> statement-breakpoint
ANALYZE "catalog_printings" ("color_identity_mask");
