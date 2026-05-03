-- Task #117: archive/restore individual bills in the Billing ledger.
-- Idempotent so production VPS can re-run safely.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
