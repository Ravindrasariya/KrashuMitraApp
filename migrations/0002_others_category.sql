-- Task #84: generic "others" marketplace category.
--
-- Adds 13 nullable columns to marketplace_listings used by the "others"
-- category form. None backfill from existing rows — every existing
-- non-"others" listing simply leaves them NULL. The two enum-style
-- columns (others_condition, others_return_policy) are NOT enforced at
-- the DB level; the server's POST/PATCH branch validates against
-- MARKETPLACE_OTHERS_CONDITIONS / MARKETPLACE_OTHERS_RETURN_POLICIES so
-- the allow-lists can evolve without DDL.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0002_others_category.sql
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS others_product_name text,
  ADD COLUMN IF NOT EXISTS others_brand text,
  ADD COLUMN IF NOT EXISTS others_price integer,
  ADD COLUMN IF NOT EXISTS others_materials text,
  ADD COLUMN IF NOT EXISTS others_condition text,
  ADD COLUMN IF NOT EXISTS others_warranty_years integer,
  ADD COLUMN IF NOT EXISTS others_dimensions text,
  ADD COLUMN IF NOT EXISTS others_return_policy text,
  ADD COLUMN IF NOT EXISTS others_extra1 text,
  ADD COLUMN IF NOT EXISTS others_extra2 text,
  ADD COLUMN IF NOT EXISTS others_extra3 text,
  ADD COLUMN IF NOT EXISTS others_extra4 text,
  ADD COLUMN IF NOT EXISTS others_extra5 text;

COMMIT;
