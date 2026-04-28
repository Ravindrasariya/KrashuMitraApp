-- Task #81: per-IST-day stockId on every marketplace listing.
--
-- Adds a server-generated identifier of the form `YYYYMMDD-N` (IST calendar
-- day + counter that resets at IST midnight). Generated atomically in the
-- same transaction as the listing insert (see server/storage.ts
-- createMarketplaceListing) via INSERT ... ON CONFLICT ... RETURNING on
-- marketplace_stock_counters.
--
-- The column is intentionally NULLABLE so existing production rows that
-- pre-date this migration keep working without a value until the backfill
-- block at the bottom of this script has been run on that environment.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0001_marketplace_stock_id.sql
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE marketplace_listings
  ADD COLUMN IF NOT EXISTS stock_id text;

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listings_stock_id_unique
  ON marketplace_listings (stock_id);

CREATE TABLE IF NOT EXISTS marketplace_stock_counters (
  ist_day text PRIMARY KEY,
  last_n integer NOT NULL
);

-- Backfill any rows that don't yet have a stock_id, ordered by IST day then
-- id. Idempotent — only touches NULL rows.
WITH numbered AS (
  SELECT
    id,
    to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_day,
    ROW_NUMBER() OVER (
      PARTITION BY (created_at AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY id ASC
    ) AS n
  FROM marketplace_listings
  WHERE stock_id IS NULL
)
UPDATE marketplace_listings ml
SET stock_id = numbered.ist_day || '-' || numbered.n
FROM numbered
WHERE ml.id = numbered.id;

-- Seed the counter table to the per-day max so future inserts on a
-- historical IST day continue from there.
INSERT INTO marketplace_stock_counters (ist_day, last_n)
SELECT
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_day,
  COUNT(*)::integer AS last_n
FROM marketplace_listings
GROUP BY 1
ON CONFLICT (ist_day) DO UPDATE
  SET last_n = GREATEST(marketplace_stock_counters.last_n, EXCLUDED.last_n);

COMMIT;
