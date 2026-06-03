-- Saved farm plots for Plot Health Check.
--
-- Per-user named plots: store a plot's coordinates under a name so a farmer can
-- reload them from a dropdown in the Plot Health Check flow instead of
-- re-typing the lat/long each time.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0013_saved_farms.sql
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS saved_farms (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS saved_farms_user_id_idx ON saved_farms (user_id);

COMMIT;
