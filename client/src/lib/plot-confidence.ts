// ---------------------------------------------------------------------------
// Plot Health reading confidence
// ---------------------------------------------------------------------------
// A single, combined confidence value per satellite reading (date) — covering
// all three indices (NDVI / NDRE / NDMI) together, never one per index.
//
// Primary signal: the per-plot valid-pixel fraction (fraction of cloud-free
// pixels inside the plot box) the server already returns for every reading.
// Secondary signal: a one-day artifact check — if a reading dips/spikes sharply
// versus the average of its nearest real neighbours on >=2 of the 3 indices, it
// is likely an atmospheric artifact (thin haze / cloud-shadow edge) even when
// the scene-wide cloud% reads 0, so its confidence is reduced.
//
// This is display-only: it does not change any index value, the chart shape, or
// the existing drop / "needs attention" warning.

export type ConfidenceBand = "high" | "medium" | "low";

export interface ReadingConfidence {
  pct: number;
  band: ConfidenceBand;
}

export interface IndexTriple {
  ndvi: number | null;
  ndre: number | null;
  ndmi: number | null;
}

// Per-index distance from the neighbour average above which a reading is treated
// as a likely single-day artifact.
const ARTIFACT_DELTA = 0.08;
// Multiplier applied to the valid-pixel confidence when a reading looks like an
// artifact (a sharp V-dip / spike against both neighbours).
const ARTIFACT_PENALTY = 0.5;

const KEYS: Array<keyof IndexTriple> = ["ndvi", "ndre", "ndmi"];

export function bandOf(pct: number): ConfidenceBand {
  if (pct >= 85) return "high";
  if (pct >= 60) return "medium";
  return "low";
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Combined confidence for a single reading.
 * @param validFraction per-plot clear-pixel fraction (0..1)
 * @param current       the reading's three index means
 * @param prev/next     nearest *real* neighbouring readings (for the artifact check)
 */
export function computeConfidence(
  validFraction: number | null | undefined,
  current?: IndexTriple | null,
  prev?: IndexTriple | null,
  next?: IndexTriple | null,
): ReadingConfidence {
  let pct = Math.round(clamp01(validFraction ?? 0) * 100);

  // A one-day V-dip / spike can only be confirmed when the reading sits between
  // two real neighbours; at the series edges (only one neighbour) we cannot tell
  // an artifact from a genuine trend, so we leave the valid-pixel confidence be.
  if (current && prev && next) {
    let anomalies = 0;
    for (const k of KEYS) {
      const cur = current[k];
      const p = prev[k];
      const n = next[k];
      if (cur == null || p == null || n == null) continue;
      const avg = (p + n) / 2;
      if (Math.abs(cur - avg) > ARTIFACT_DELTA) anomalies++;
    }
    if (anomalies >= 2) pct = Math.round(pct * ARTIFACT_PENALTY);
  }

  pct = Math.max(0, Math.min(100, pct));
  return { pct, band: bandOf(pct) };
}

// Tailwind classes per band, shared by the tooltip and the cards.
export const CONFIDENCE_CLASSES: Record<ConfidenceBand, { text: string; dot: string }> = {
  high: { text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  medium: { text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  low: { text: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
};
