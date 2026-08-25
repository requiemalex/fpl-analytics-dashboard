/**
 * The FPL API represents many numeric stats (xG, ICT index, PPG, ownership)
 * as strings. This parses them defensively: anything that isn't a finite
 * number becomes `null` (unavailable), never NaN and never a silently
 * substituted 0.
 */
export function parseNumericString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNumberOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}
