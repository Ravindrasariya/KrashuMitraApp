-- Task #105: optional Firm Details on user profile.
--
-- Adds 6 nullable varchar columns to `users` so farmers/traders can
-- record their business identity (firm name, address, state, pincode,
-- PAN, GST). All fields are optional and edited only on the profile page.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0005_user_firm_details.sql
-- Idempotent — IF NOT EXISTS makes re-running safe.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS firm_name     varchar,
  ADD COLUMN IF NOT EXISTS firm_address  varchar,
  ADD COLUMN IF NOT EXISTS firm_state    varchar,
  ADD COLUMN IF NOT EXISTS firm_pincode  varchar,
  ADD COLUMN IF NOT EXISTS firm_pan      varchar,
  ADD COLUMN IF NOT EXISTS firm_gst      varchar;

COMMIT;
