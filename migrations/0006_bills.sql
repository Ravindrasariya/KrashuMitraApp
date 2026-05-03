-- Task #108: Amazon-style PDF bill generation
-- Adds a dedicated sequence + table so the order/invoice numbers
-- (ON{YYYYMMDD}{N} / IN{YYYYMMDD}{N}) are globally unique across all sellers
-- and the full draft snapshot is persisted for future reprint.

CREATE SEQUENCE IF NOT EXISTS bill_seq;

CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  sequence_no INTEGER NOT NULL UNIQUE DEFAULT nextval('bill_seq'),
  seller_id VARCHAR NOT NULL REFERENCES users(id),
  listing_id INTEGER REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  bill_date DATE NOT NULL,
  payment_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
