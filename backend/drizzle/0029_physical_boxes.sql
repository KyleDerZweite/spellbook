CREATE TABLE physical_boxes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id text NOT NULL REFERENCES user_profiles(account_id) ON DELETE CASCADE,
    request_id uuid NOT NULL,
    creation_name text NOT NULL,
    name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 64),
    condition jsonb CHECK (jsonb_typeof(condition) = 'array' AND jsonb_array_length(condition) BETWEEN 1 AND 3),
    UNIQUE (account_id, request_id)
);
--> statement-breakpoint
CREATE INDEX physical_boxes_account_idx ON physical_boxes (account_id, name, id);
