// Shared currency formatter for marketplace listing prices.
//
// Rules (Task #99):
//   • Whole-rupee values render with NO decimal portion: 19 → "19",
//     500 → "500".
//   • Fractional values render with EXACTLY two decimals (paise):
//     19.8 → "19.80", 19.80 → "19.80", 19.50 → "19.50".
//   • Anything that looks like an integer once rounded to two decimals is
//     treated as whole — so 19.001 becomes "19" (not "19.00") because the
//     paise round to 0. The form / API enforce a 2-decimal cap upstream;
//     this is just defense-in-depth so display never shows "X.00".
//
// Accepts the value as `number | string | null | undefined` because Drizzle
// surfaces `doublePrecision` columns as JS numbers but other call sites
// occasionally pass already-stringified amounts.

export function formatRupeeAmount(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2);
}

// Validate a free-text price entered by the seller.
// Returns the parsed numeric value (rounded to paise) when the input is a
// well-formed amount within [min, max]; returns null otherwise. Empty
// strings are considered invalid — callers that allow "no price" should
// short-circuit on `raw.trim() === ""` themselves.
export function parsePriceInput(
  raw: unknown,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  if (rounded < min || rounded > max) return null;
  return rounded;
}
