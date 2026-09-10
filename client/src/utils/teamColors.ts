const GOLDEN_ANGLE_DEG = 137.50776;

/**
 * A distinct, deterministic accent colour per team — generated, not
 * hand-picked from a lookup table. The app's team list isn't just the
 * current season's clubs (relegated/historic clubs from other seasons
 * appear too, e.g. in the Team filter and historic analysis), so a fixed
 * per-club palette would need constant upkeep and silently fall back to
 * nothing for any club it didn't cover. Rotating by the golden angle
 * instead guarantees well-separated hues for any sequence of team ids,
 * with no lookup table and no maintenance as the dataset grows. Same
 * saturation/lightness family as this app's position colours (--pos-*,
 * tokens.css) so team accents read as the same design system, just a
 * generated categorical set rather than four fixed tokens.
 */
export function teamAccentColor(teamId: number): string {
  const hue = (teamId * GOLDEN_ANGLE_DEG) % 360;
  return `hsl(${hue.toFixed(1)}, 72%, 62%)`;
}
