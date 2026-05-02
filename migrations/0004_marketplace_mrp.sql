-- Task #102: optional M.R.P. paired with KrashuVed Price.
--
-- Adds 5 nullable double precision columns alongside the existing 5 price
-- columns on `marketplace_listings`. When the seller fills BOTH a price and
-- an MRP, the listing card surfaces a "-NN%" discount badge plus a struck
-- MRP line. Server enforces `mrp > price` whenever both are set.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0004_marketplace_mrp.sql
-- Idempotent — IF NOT EXISTS makes re-running safe.

BEGIN;

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS onion_seed_mrp_per_kg          double precision,
  ADD COLUMN IF NOT EXISTS soyabean_seed_mrp_per_quintal  double precision,
  ADD COLUMN IF NOT EXISTS bag_mrp_per_bag                double precision,
  ADD COLUMN IF NOT EXISTS fan_mrp_per_piece              double precision,
  ADD COLUMN IF NOT EXISTS others_mrp                     double precision;

COMMIT;
