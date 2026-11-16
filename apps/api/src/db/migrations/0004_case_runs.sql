-- One row per player per case. A run belongs to a user OR to an anonymous guest
-- (identified by the SHA-256 of a random cookie token), never both.
CREATE TABLE case_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          text NOT NULL,
  user_id          uuid REFERENCES users(id) ON DELETE CASCADE,
  guest_token_hash char(64),
  state            jsonb NOT NULL,
  -- Incremented on every save; writes must name the version they read (optimistic locking).
  version          integer NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_runs_one_owner CHECK ((user_id IS NULL) <> (guest_token_hash IS NULL))
);
CREATE UNIQUE INDEX case_runs_user_case_idx ON case_runs (user_id, case_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX case_runs_guest_case_idx ON case_runs (guest_token_hash, case_id) WHERE guest_token_hash IS NOT NULL;
