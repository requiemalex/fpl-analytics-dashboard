export type RGB = [number, number, number];

export const NEUTRAL_RGB: RGB = [159, 176, 166];
export const GREEN_RGB: RGB = [63, 191, 127];
export const RED_RGB: RGB = [224, 101, 74];

function interpolateRGB(t: number, low: RGB, high: RGB): RGB {
  const c = Math.max(0, Math.min(1, t));
  return [Math.round(low[0] + (high[0] - low[0]) * c), Math.round(low[1] + (high[1] - low[1]) * c), Math.round(low[2] + (high[2] - low[2]) * c)];
}

/**
 * Where a value sits within [min, max], respecting direction — 0 at the
 * "worst" end, 1 at the "best" end, regardless of whether higher or
 * lower numbers are actually better for this particular metric. Shared
 * by every relative color-scale function below so they can't disagree
 * about direction handling.
 */
function relativePosition(value: number, min: number, max: number, higherIsBetter: boolean): number | null {
  if (max === min) return null;
  const t = (value - min) / (max - min);
  return higherIsBetter ? t : 1 - t;
}

/**
 * Full-intensity green/red TEXT colour relative to a row's own min/max
 * range, fading to neutral grey near the middle — Player Comparison's
 * colour scale.
 */
export function relativeCellTextColor(value: number, min: number, max: number, higherIsBetter: boolean): string {
  const t = relativePosition(value, min, max, higherIsBetter);
  if (t === null) return `rgb(${NEUTRAL_RGB.join(",")})`;
  const rgb = t > 0.5 ? interpolateRGB((t - 0.5) * 2, NEUTRAL_RGB, GREEN_RGB) : t < 0.5 ? interpolateRGB((0.5 - t) * 2, NEUTRAL_RGB, RED_RGB) : NEUTRAL_RGB;
  return `rgb(${rgb.join(",")})`;
}

/**
 * A gentle background TINT (low alpha, capped at `maxAlpha`) relative to
 * a column's own min/max range — for a "minor better/worse indicator"
 * that stays in the background rather than dominating the table's
 * existing colouring. Returns undefined (no style change at all) for
 * values right at the middle of the range, rather than a technically-
 * correct-but-invisible near-zero-alpha tint.
 */
export function relativeCellTint(value: number, min: number, max: number, higherIsBetter: boolean, maxAlpha = 0.16): string | undefined {
  const t = relativePosition(value, min, max, higherIsBetter);
  if (t === null) return undefined;
  const intensity = Math.abs(t - 0.5) * 2;
  if (intensity < 0.03) return undefined;
  const rgb = t > 0.5 ? GREEN_RGB : RED_RGB;
  return `rgba(${rgb.join(",")}, ${(intensity * maxAlpha).toFixed(3)})`;
}
