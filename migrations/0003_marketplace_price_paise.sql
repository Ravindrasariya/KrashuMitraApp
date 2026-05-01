-- Task #99: marketplace prices accept paise (1–2 decimal places).
--
-- Changes 5 marketplace_listings price columns from integer to
-- double precision so sellers can enter values like 19.80. The cast is
-- a widening (integer is a strict subset of double precision) so no
-- existing data is lost.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0003_marketplace_price_paise.sql
-- Idempotent — re-running is safe (ALTER COLUMN ... TYPE double precision
-- on a column that's already double precision is a no-op for our purposes).

BEGIN;

ALTER TABLE marketplace_listings
  ALTER COLUMN onion_seed_price_per_kg            TYPE double precision USING onion_seed_price_per_kg::double precision,
  ALTER COLUMN soyabean_seed_price_per_quintal    TYPE double precision USING soyabean_seed_price_per_quintal::double precision,
  ALTER COLUMN bag_price_per_bag                  TYPE double precision USING bag_price_per_bag::double precision,
  ALTER COLUMN fan_price_per_piece                TYPE double precision USING fan_price_per_piece::double precision,
  ALTER COLUMN others_price                       TYPE double precision USING others_price::double precision;

COMMIT;
