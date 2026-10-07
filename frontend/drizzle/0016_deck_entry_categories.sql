CREATE TABLE oracle_tag_publications (
 id uuid PRIMARY KEY, descriptor jsonb NOT NULL, source_updated_at timestamptz NOT NULL,
 payload_digest text NOT NULL, parser_version integer NOT NULL, mapping_version integer NOT NULL,
 mapping jsonb NOT NULL, ingested_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE oracle_tags (
 publication_id uuid NOT NULL REFERENCES oracle_tag_publications(id) ON DELETE CASCADE,
 id uuid NOT NULL, label text NOT NULL, PRIMARY KEY(publication_id,id)
);
--> statement-breakpoint
CREATE TABLE oracle_tag_closure (
 publication_id uuid NOT NULL REFERENCES oracle_tag_publications(id) ON DELETE CASCADE,
 ancestor_id uuid NOT NULL, descendant_id uuid NOT NULL,
 PRIMARY KEY(publication_id,ancestor_id,descendant_id)
);
--> statement-breakpoint
CREATE TABLE oracle_tag_memberships (
 publication_id uuid NOT NULL REFERENCES oracle_tag_publications(id) ON DELETE CASCADE,
 tag_id uuid NOT NULL, oracle_id uuid NOT NULL, weight text NOT NULL,
 PRIMARY KEY(publication_id,tag_id,oracle_id)
);
--> statement-breakpoint
CREATE INDEX oracle_tag_memberships_card_idx ON oracle_tag_memberships(publication_id,oracle_id,tag_id);
--> statement-breakpoint
CREATE TABLE oracle_tag_state (
 id integer PRIMARY KEY CHECK(id=1), active_publication uuid REFERENCES oracle_tag_publications(id),
 previous_publication uuid REFERENCES oracle_tag_publications(id), refresh_status jsonb NOT NULL DEFAULT '{"kind":"NeverAttempted"}'
);
--> statement-breakpoint
INSERT INTO oracle_tag_state(id) VALUES(1);
--> statement-breakpoint
CREATE TABLE catalog_oracle_facts (
 generation_id uuid NOT NULL REFERENCES catalog_generations(id) ON DELETE CASCADE,
 printing_id uuid NOT NULL, raw_oracle_id uuid, types text[], transform_version integer NOT NULL,
 PRIMARY KEY(generation_id,printing_id)
);
--> statement-breakpoint
CREATE TABLE deck_category_bundles (
 deck_id uuid PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
 definitions jsonb NOT NULL, decision_revision bigint NOT NULL DEFAULT 0 CHECK(decision_revision>=0)
);
--> statement-breakpoint
CREATE TABLE deck_entry_category_decisions (
 entry_id uuid PRIMARY KEY REFERENCES deck_cards(id) ON DELETE CASCADE,
 deck_id uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE, category_id uuid,
 state text NOT NULL CHECK(state IN ('Automatic','Manual','Pending')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), evidence jsonb
);
--> statement-breakpoint
CREATE INDEX deck_entry_category_decisions_deck_idx ON deck_entry_category_decisions(deck_id);
--> statement-breakpoint
CREATE TABLE category_mutation_requests (
 account_id text NOT NULL REFERENCES user_profiles(account_id) ON DELETE CASCADE,
 request_id uuid NOT NULL, request_hash text NOT NULL, acknowledgement jsonb NOT NULL,
 PRIMARY KEY(account_id,request_id)
);
