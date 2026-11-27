CREATE TABLE reference_deck_sources (
    source text PRIMARY KEY CHECK (source = btrim(source) AND char_length(source) BETWEEN 1 AND 64),
    enabled boolean NOT NULL DEFAULT false,
    last_synced_at timestamp with time zone,
    last_attempt_at timestamp with time zone,
    last_status text NOT NULL DEFAULT 'idle' CHECK (last_status IN ('idle', 'ok', 'failed')),
    last_error text,
    deck_count integer NOT NULL DEFAULT 0 CHECK (deck_count >= 0),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reference_decks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL CHECK (source = btrim(source) AND char_length(source) BETWEEN 1 AND 64),
    external_id text NOT NULL CHECK (external_id = btrim(external_id) AND char_length(external_id) BETWEEN 1 AND 256),
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 200),
    format text NOT NULL CHECK (format = btrim(format) AND char_length(format) BETWEEN 1 AND 64),
    archetype text CHECK (archetype IS NULL OR (archetype = btrim(archetype) AND char_length(archetype) BETWEEN 1 AND 200)),
    source_url text CHECK (source_url IS NULL OR char_length(source_url) BETWEEN 1 AND 1000),
    meta_share double precision CHECK (meta_share IS NULL OR (meta_share >= 0 AND meta_share <= 100)),
    source_updated_at timestamp with time zone,
    synced_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (source, external_id)
);
--> statement-breakpoint
CREATE TABLE reference_deck_cards (
    reference_deck_id uuid NOT NULL REFERENCES reference_decks(id) ON DELETE CASCADE,
    oracle_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('main', 'sideboard', 'commander', 'companion')),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
    card_name text NOT NULL CHECK (card_name = btrim(card_name) AND char_length(card_name) BETWEEN 1 AND 200),
    PRIMARY KEY (reference_deck_id, oracle_id, role)
);
--> statement-breakpoint
CREATE INDEX reference_decks_format_idx ON reference_decks (format, meta_share DESC NULLS LAST, name, id);
--> statement-breakpoint
CREATE INDEX reference_decks_source_format_idx ON reference_decks (source, format);
--> statement-breakpoint
CREATE INDEX reference_deck_cards_oracle_idx ON reference_deck_cards (oracle_id);
