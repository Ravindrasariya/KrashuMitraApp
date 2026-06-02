-- Task #143: Plot Health crop + stage health verdict reference table.
--
-- Stores the healthy NDVI/NDRE/NDMI ranges per crop + growth stage used by the
-- Digital Clinic "Plot Health Check" to decide whether a field's measured index
-- means are healthy or below the expected range for the chosen crop+stage.
--
-- The table is auto-seeded at app startup by seedCropStageReferences() in
-- server/storage.ts (idempotent ON CONFLICT DO NOTHING against the unique
-- (crop_key, stage_key) index), so creating the table here is sufficient — the
-- rows populate themselves on the next boot.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0011_crop_stage_references.sql
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS crop_stage_references (
  id serial PRIMARY KEY,
  crop_key text NOT NULL,
  stage_key text NOT NULL,
  ndvi_lower double precision,
  ndvi_typical double precision,
  ndvi_upper double precision,
  ndre_lower double precision,
  ndre_typical double precision,
  ndre_upper double precision,
  ndmi_lower double precision,
  ndmi_typical double precision,
  ndmi_upper double precision,
  guidance_hi text,
  guidance_en text,
  source text,
  is_generic boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS crop_stage_references_crop_stage_idx
  ON crop_stage_references (crop_key, stage_key);

COMMIT;
