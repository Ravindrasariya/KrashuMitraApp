-- Plot Health Check search audit log.
--
-- One row per /api/plot-health/analyze call: the requested + resolved date,
-- location (lat/long + box size), chosen crop + stage, and the measured
-- NDVI/NDRE/NDMI values (mean/min/max) plus cloud cover, valid fraction, and
-- the derived health verdict. "No clear image" misses are logged too, with the
-- index columns left NULL and no_clear_image = true.
--
-- Apply with: psql "$DATABASE_URL" -f migrations/0012_plot_health_searches.sql
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS plot_health_searches (
  id serial PRIMARY KEY,
  user_id varchar REFERENCES users(id),
  requested_date text NOT NULL,
  resolved_date text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  box_size_m integer NOT NULL,
  crop_type text,
  crop_stage text,
  ndvi_mean double precision,
  ndvi_min double precision,
  ndvi_max double precision,
  ndre_mean double precision,
  ndre_min double precision,
  ndre_max double precision,
  ndmi_mean double precision,
  ndmi_min double precision,
  ndmi_max double precision,
  cloud_cover double precision,
  valid_fraction double precision,
  verdict text,
  no_clear_image boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMIT;
