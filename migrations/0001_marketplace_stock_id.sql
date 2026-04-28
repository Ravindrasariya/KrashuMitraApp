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

-- Backfill rows that don't yet have a stock_id. Safe in mixed states (some
-- rows already assigned on the same IST day, others still NULL): the new
-- numbers start from the existing per-day max + 1, so they never collide
-- with already-assigned values on the unique index. Idempotent — re-running
-- with no NULL rows is a no-op.
WITH existing_max AS (
  SELECT
    to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_day,
    COALESCE(MAX(NULLIF(split_part(stock_id, '-', 2), '')::int), 0) AS max_n
  FROM marketplace_listings
  WHERE stock_id IS NOT NULL
  GROUP BY 1
),
numbered AS (
  SELECT
    ml.id,
    to_char(ml.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_day,
    COALESCE(em.max_n, 0) + ROW_NUMBER() OVER (
      PARTITION BY (ml.created_at AT TIME ZONE 'Asia/Kolkata')::date
      ORDER BY ml.id ASC
    ) AS n
  FROM marketplace_listings ml
  LEFT JOIN existing_max em
    ON em.ist_day = to_char(ml.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
  WHERE ml.stock_id IS NULL
)
UPDATE marketplace_listings ml
SET stock_id = numbered.ist_day || '-' || numbered.n
FROM numbered
WHERE ml.id = numbered.id;

-- Seed the counter table to the per-day max of stock_ids actually present,
-- so future inserts on a historical IST day continue from there. Uses the
-- numeric suffix of stock_id rather than COUNT(*) so deleted rows or
-- mixed-state backfills never produce a starting point that collides.
INSERT INTO marketplace_stock_counters (ist_day, last_n)
SELECT
  to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') AS ist_day,
  MAX(NULLIF(split_part(stock_id, '-', 2), '')::int) AS last_n
FROM marketplace_listings
WHERE stock_id IS NOT NULL
GROUP BY 1
ON CONFLICT (ist_day) DO UPDATE
  SET last_n = GREATEST(marketplace_stock_counters.last_n, EXCLUDED.last_n);

COMMIT;
