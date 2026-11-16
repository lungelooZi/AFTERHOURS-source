-- Public session ids (so clients never see token hashes) and last-used tracking.
-- The volatile default gives every existing row its own id.
ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ADD CONSTRAINT sessions_id_key UNIQUE (id);
ALTER TABLE sessions ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now();
