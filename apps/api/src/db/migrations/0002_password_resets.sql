-- Single-use password reset tokens. Only the SHA-256 of each token is stored.
CREATE TABLE password_reset_tokens (
  token_hash char(64) PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  ip         inet
);
-- Supports invalidating a user's other outstanding tokens when one is used.
CREATE INDEX password_reset_tokens_user_open_idx ON password_reset_tokens (user_id) WHERE used_at IS NULL;
