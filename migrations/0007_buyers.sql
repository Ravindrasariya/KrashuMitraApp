-- Task #112: Buyer ledger
-- Adds a buyers table per seller with a unique (sellerId, lower(name), phone)
-- index, plus buyer_id and paid_at columns on bills. Includes a one-time
-- idempotent backfill that materialises buyers from bills.payload and
-- stamps cash bills as paid on bill_date.

CREATE TABLE IF NOT EXISTS buyers (
  id SERIAL PRIMARY KEY,
  seller_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_code TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  red_flag BOOLEAN NOT NULL DEFAULT false,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  merged_from_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS buyers_seller_name_phone_unique
  ON buyers (seller_id, lower(name), phone);
CREATE UNIQUE INDEX IF NOT EXISTS buyers_seller_code_unique
  ON buyers (seller_id, buyer_code);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES buyers(id) ON DELETE SET NULL;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_at DATE;

-- Idempotent backfill of buyers from existing bills.
DO $$
DECLARE
  r RECORD;
  v_name TEXT;
  v_phone TEXT;
  v_address TEXT;
  v_buyer_id INTEGER;
  v_seq INTEGER;
  v_code TEXT;
  v_date_part TEXT;
BEGIN
  FOR r IN
    SELECT b.id, b.seller_id, b.bill_date, b.payment_type, b.payload
    FROM bills b
    WHERE b.buyer_id IS NULL
    ORDER BY b.id ASC
  LOOP
    v_name := COALESCE(NULLIF(regexp_replace(btrim(r.payload->>'buyerName'), '\s+', ' ', 'g'), ''), '');
    v_phone := COALESCE(NULLIF(regexp_replace(r.payload->>'buyerPhone', '\s+', '', 'g'), ''), '');
    v_address := COALESCE(NULLIF(trim(r.payload->>'buyerAddress'), ''), '');

    SELECT id INTO v_buyer_id
    FROM buyers
    WHERE seller_id = r.seller_id
      AND lower(name) = lower(v_name)
      AND phone = v_phone
    LIMIT 1;

    IF v_buyer_id IS NULL THEN
      v_date_part := to_char(r.bill_date, 'YYYYMMDD');
      -- Per-seller GLOBAL counter — increments across ALL of this seller's
      -- buyers, not per-date. Strip the `B` + 8-digit date prefix and read
      -- the trailing `{N}` from any existing buyer_code for this seller.
      SELECT COALESCE(MAX(
        CASE WHEN buyer_code ~ '^B[0-9]{8}[0-9]+$'
             THEN substring(buyer_code from 10)::int
             ELSE 0 END
      ), 0) + 1
      INTO v_seq
      FROM buyers
      WHERE seller_id = r.seller_id;
      v_code := 'B' || v_date_part || v_seq::text;

      INSERT INTO buyers (seller_id, buyer_code, name, phone, address)
      VALUES (r.seller_id, v_code, v_name, v_phone, v_address)
      RETURNING id INTO v_buyer_id;
    END IF;

    UPDATE bills
    SET buyer_id = v_buyer_id,
        paid_at = CASE WHEN payment_type = 'cash' THEN bill_date ELSE NULL END
    WHERE id = r.id;
  END LOOP;
END$$;
