import type { NormalizedPlayer, Position } from "../types/normalized";

/**
 * FPL clean-sheet points by position — verified against the current
 * official scoring rules (confirmed live, not carried over from an older
 * season's docs): goalkeepers and defenders earn 4, midfielders 1,
 * forwards 0. The API gives raw clean-sheet counts, not the points they
 * convert to, so this table has to be hard-coded rather than read from a
 * field — it isn't derived from anything else in this app and needs
 * updating by hand if FPL ever changes it.
 */
export const CLEAN_SHEET_POINTS_BY_POSITION: Record<Position, number> = {
  GKP: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
};

/** Clean-sheet points earned per 90 minutes, using the position table above. Null if the player hasn't played. */
export function cleanSheetPointsPer90(player: NormalizedPlayer): number | null {
  if (player.minutes <= 0) return null;
  const pointsPerCleanSheet = CLEAN_SHEET_POINTS_BY_POSITION[player.position];
  return ((player.cleanSheets * pointsPerCleanSheet) / player.minutes) * 90;
}

/** Total bonus points per 90. Null if the player hasn't played. */
export function bonusPer90(player: NormalizedPlayer): number | null {
  if (player.minutes <= 0) return null;
  return (player.bonus / player.minutes) * 90;
}

/**
 * Clean-sheet points/90 + total bonus/90 — the closest honest read of
 * "defensive reward rate" available from the public API. This is
 * deliberately NOT "bonus points caused by defensive contribution":
 * defensive actions feed into the Bonus Points System alongside goals,
 * assists, clean sheets, and saves, but the API only exposes total bonus,
 * never a breakdown by contributing factor. Using total bonus here is a
 * proxy, not an isolation — labelled as such wherever this is shown.
 */
export function defensiveRewardPer90(player: NormalizedPlayer): number | null {
  const cs = cleanSheetPointsPer90(player);
  const bonus = bonusPer90(player);
  if (cs === null || bonus === null) return null;
  return cs + bonus;
}
