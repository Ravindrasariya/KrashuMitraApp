---
name: CDSE / Sentinel Hub API quirks
description: Non-obvious request requirements for Copernicus Data Space (CDSE) Catalog STAC search and Statistics API used by Plot Health Check
---

# CDSE / Sentinel Hub API quirks

Endpoints (Copernicus Data Space Ecosystem, used by `server/sentinel.ts`):
- Catalog STAC search: `https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search`
- Statistics: `https://sh.dataspace.copernicus.eu/api/v1/statistics`
- OAuth token: `identity.dataspace.copernicus.eu` (client_credentials with CDSE_CLIENT_ID/SECRET)

## Catalog STAC search
- **Must send `Accept: application/geo+json`.** `Accept: application/json` is rejected with **HTTP 406** — the endpoint emits geo+json.
- **Do NOT send `sortby`.** Including a `sortby` key silently returns **0 features** from this endpoint. Instead omit it and sort the returned features by `properties.datetime` descending in JS to pick the most recent.
- **Filter must be cql2-json (object), not cql2-text (string).** Use `filter-lang: cql2-json` with an object like `{op:"<",args:[{property:"eo:cloud_cover"}, maxCloud]}`.

## Statistics API (P1D aggregation)
- **The `timeRange.to` must be an EXCLUSIVE next-day boundary**, not `T23:59:59Z` of the same day. With `aggregationInterval P1D`, a `to` of `<date>T23:59:59Z` is too narrow and returns **empty data** (all index stats come back missing → UI shows "—"). Fix: set `from = <date>T00:00:00Z`, `to = <date+1day>T00:00:00Z` (compute via `setUTCDate(+1)`, which rolls over month/year correctly).
- Band keys returned by the stats evalscript are `B0` / `B1` / `B2` (these are correct; the empty-data symptom was the time range, not the band names).

**Why:** All three catalog requirements and the stats time-range were each independently capable of breaking analysis; verified live via curl + in-process tsx tests. The failures are silent (406, or empty result sets) so they are hard to diagnose from error messages alone.
