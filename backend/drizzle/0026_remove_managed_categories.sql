DROP TABLE
	"category_preview_differences",
	"category_change_previews",
	"category_definition_versions",
	"category_definition_origins",
	"category_library_state",
	"category_mutation_requests",
	"deck_entry_category_decisions",
	"deck_whole_category_decisions",
	"deck_whole_category_jobs",
	"deck_whole_categories",
	"deck_category_bundles",
	"oracle_tag_closure",
	"oracle_tag_memberships",
	"oracle_tag_state",
	"oracle_tags",
	"oracle_tag_publications",
	"combo_variant_ingredients",
	"combo_variant_outcomes",
	"combo_variants",
	"combo_outcomes",
	"combo_state",
	"combo_publications",
	"catalog_oracle_facts";
--> statement-breakpoint
DROP FUNCTION "guard_category_definition_origin"();
--> statement-breakpoint
DROP FUNCTION "guard_category_definition_version"();
