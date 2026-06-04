---
name: Plot Health reading confidence
description: How the single per-reading confidence % for satellite readings is defined and why
---

# Plot Health reading confidence

A single combined confidence value per satellite reading/date (covers all three indices NDVI/NDRE/NDMI together — never one per index). Computed client-side in `client/src/lib/plot-confidence.ts`; shown in the trend-chart tooltip (top) and on the Lot-averages + Crop Health Assessment cards.

**Model:**
- Base = per-plot valid-pixel fraction (`validFraction`, 0..1) → %. This is the real per-plot reliability gauge.
- Artifact halving: only when the reading has BOTH real neighbours, if it deviates >0.08 from the (prev+next)/2 average on ≥2 of the 3 indices, multiply confidence by 0.5 (a one-day V-dip/spike = likely atmospheric artifact).
- Bands: High ≥85, Medium 60–84, Low <60. Estimated/forecast points show "Estimate", not a %.

**Why:**
- Scene-level cloud% is tile-wide (~110 km) and can read 0% while a thin haze / cloud-shadow edge still corrupts the small plot — so cloud% is NOT trustworthy per-plot; validFraction is.
- The artifact check needs BOTH neighbours: with only one (series edge) you cannot distinguish an artifact from a genuine trend, so don't penalize edge readings.

**How to apply:** Keep confidence display-only — it must never change index values, the chart shape, or the existing drop/"needs attention" warning. If you change the band thresholds or the 0.08 / 0.5 constants, update both the tooltip and the two cards (they share the same helper, so this is automatic).
