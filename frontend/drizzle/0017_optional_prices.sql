-- Staged additive SQL. Journal/snapshot follows verified migration 0016.
CREATE TABLE optional_price_publications (
    id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('Cardmarket', 'MTGJSON')),
    time_precision text NOT NULL CHECK (time_precision IN ('Instant', 'Day')),
    source_instant timestamptz,
    source_date date,
    descriptor jsonb NOT NULL,
    payload_digest text NOT NULL,
    extractor_version integer NOT NULL,
    mapping_version integer NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((time_precision='Instant' AND source_instant IS NOT NULL AND source_date IS NULL)
        OR (time_precision='Day' AND source_date IS NOT NULL AND source_instant IS NULL))
);
CREATE TABLE optional_price_state (
    source text PRIMARY KEY CHECK (source IN ('Cardmarket', 'MTGJSON')),
    enabled boolean NOT NULL DEFAULT false,
    active_publication uuid REFERENCES optional_price_publications(id),
    previous_publication uuid REFERENCES optional_price_publications(id),
    refresh_status jsonb NOT NULL DEFAULT '{"kind":"NeverAttempted"}'::jsonb
);
INSERT INTO optional_price_state(source) VALUES ('Cardmarket'), ('MTGJSON');
CREATE TABLE optional_price_printings (
    publication_id uuid NOT NULL REFERENCES optional_price_publications(id) ON DELETE CASCADE,
    printing_id uuid NOT NULL,
    identity jsonb NOT NULL,
    finishes text[] NOT NULL,
    variant_key text,
    PRIMARY KEY(publication_id, printing_id)
);
CREATE TABLE optional_price_observations (
    publication_id uuid NOT NULL REFERENCES optional_price_publications(id) ON DELETE CASCADE,
    printing_id uuid NOT NULL,
    finish text NOT NULL CHECK (finish IN ('nonfoil', 'foil')),
    measure text NOT NULL,
    amount numeric CHECK (amount >= 0 AND amount NOT IN ('NaN'::numeric,'Infinity'::numeric)),
    raw_value text,
    supported boolean NOT NULL,
    provider_id text,
    english_printing_id uuid,
    mapping_reason text,
    PRIMARY KEY(publication_id, printing_id, finish)
);
CREATE TABLE price_history_days (
    source text NOT NULL CHECK (source IN ('Scryfall','Cardmarket','MTGJSON')),
    day date NOT NULL,
    source_instant timestamptz,
    publication_id uuid NOT NULL,
    ingested_at timestamptz NOT NULL,
    PRIMARY KEY(source,day)
);
CREATE TABLE price_source_history (
    source text NOT NULL CHECK (source IN ('Scryfall','Cardmarket','MTGJSON')),
    printing_id uuid NOT NULL,
    finish text NOT NULL CHECK (finish IN ('nonfoil','foil')),
    day date NOT NULL,
    time_precision text NOT NULL CHECK (time_precision IN ('Instant','Day')),
    source_instant timestamptz,
    amount numeric NOT NULL CHECK (amount >= 0 AND amount NOT IN ('NaN'::numeric,'Infinity'::numeric)),
    measure text NOT NULL,
    raw_value text,
    provider_id text,
    publication_id uuid NOT NULL,
    evidence jsonb NOT NULL,
    PRIMARY KEY(source,printing_id,finish,day),
    CHECK ((time_precision='Instant' AND source_instant IS NOT NULL)
        OR (time_precision='Day' AND source_instant IS NULL))
);
CREATE INDEX price_source_history_window ON price_source_history(printing_id,finish,day,source);
CREATE TABLE price_history_publications (
    publication_id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('Scryfall','Cardmarket','MTGJSON')),
    evidence jsonb NOT NULL
);
CREATE TABLE price_history_printings (
    publication_id uuid NOT NULL REFERENCES price_history_publications(publication_id) ON DELETE CASCADE,
    printing_id uuid NOT NULL,
    identity jsonb NOT NULL,
    variant_key text,
    PRIMARY KEY(publication_id,printing_id)
);
CREATE INDEX price_source_history_publication ON price_source_history(source,publication_id);
