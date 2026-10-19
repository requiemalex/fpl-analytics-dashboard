export type RGB = [number, number, number];

export const NEUTRAL_RGB: RGB = [159, 176, 166];
export const GREEN_RGB: RGB = [63, 191, 127];
export const RED_RGB: RGB = [224, 101, 74];

/** Below this distance from the middle (as a share of the half-range) there's no colour at all, rather than a technically-correct invisible one. */
const DEAD_ZONE = 0.03;

function interpolateRGB(t: number, low: RGB, high: RGB): RGB {
  const c = Math.max(0, Math.min(1, t));
  return [Math.round(low[0] + (high[0] - low[0]) * c), Math.round(low[1] + (high[1] - low[1]) * c), Math.round(low[2] + (high[2] - low[2]) * c)];
}

/**
 * The comparative colour of a figure (<comparative_colouring>,
 * metrics/comparativeColour.ts): a gentle green or red background tint
 * from its rank — a percentile, already flipped so higher is better. The
 * 50th percentile has no colour; the further from it, the stronger. No
 * rank (a small sample, an uncoloured figure, nobody to compare with) is
 * no colour. The one scale every table, tile and card uses.
 */
export function percentileTint(percentile: number | null | undefined, maxAlpha = 0.16): string | undefined {
  if (percentile === null || percentile === undefined) return undefined;
  const t = percentile / 100;
  const intensity = Math.abs(t - 0.5) * 2;
  if (intensity < DEAD_ZONE) return undefined;
  const rgb = t > 0.5 ? GREEN_RGB : RED_RGB;
  return `rgba(${rgb.join(",")}, ${(intensity * maxAlpha).toFixed(3)})`;
}

/**
 * The same scale as a solid colour, for a mark too small to carry a tint
 * (the pitch cards' reliability dot): neutral grey at the 50th percentile,
 * full green at the 100th, full red at the 0th. Undefined without a rank.
 */
export function percentileColour(percentile: number | null | undefined): string | undefined {
  if (percentile === null || percentile === undefined) return undefined;
  const t = percentile / 100;
  const rgb = t > 0.5 ? interpolateRGB((t - 0.5) * 2, NEUTRAL_RGB, GREEN_RGB) : interpolateRGB((0.5 - t) * 2, NEUTRAL_RGB, RED_RGB);
  return `rgb(${rgb.join(",")})`;
}
