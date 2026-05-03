-- Task #117: archive/restore buyers in the Billing ledger.
-- Idempotent so production VPS can re-run safely.
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
