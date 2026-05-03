-- Task #112: shared SQL helper that computes the grand total (incl. tax) for
-- a single bill's `payload` JSONB. Wraps every numeric extraction with
-- NULLIF(..., '')::numeric so empty-string fields (common in shipping when
-- the seller leaves shipping blank) don't crash the cast.
CREATE OR REPLACE FUNCTION bill_total(p jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    COALESCE(
      (
        COALESCE(NULLIF(p->'product'->>'unitPrice', '')::numeric, 0)
        - COALESCE(NULLIF(p->'product'->>'discount',  '')::numeric, 0)
      )
      * COALESCE(NULLIF(p->'product'->>'qty',       '')::numeric, 0)
      * (1 + COALESCE(NULLIF(p->'product'->>'taxRate',  '')::numeric, 0) / 100),
      0
    )
    +
    COALESCE(
      (
        COALESCE(NULLIF(p->'shipping'->>'unitPrice', '')::numeric, 0)
        - COALESCE(NULLIF(p->'shipping'->>'discount',  '')::numeric, 0)
      )
      * (1 + COALESCE(NULLIF(p->'shipping'->>'taxRate', '')::numeric, 0) / 100),
      0
    );
$$;
