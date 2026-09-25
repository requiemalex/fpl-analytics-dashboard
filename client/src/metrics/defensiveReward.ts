import type { NormalizedPlayer, Position } from "../types/normalized";
import { perEstimatedGame } from "./calculations";

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

/** Clean-sheet points earned per game (see <per_game_not_per_90>, calculations.ts), using the position table above. Null if the player hasn't played, or has no data for the selected mode. */
export function cleanSheetPointsPerGame(player: NormalizedPlayer): number | null {
  if (player.cleanSheets === null) return null;
  const pointsPerCleanSheet = CLEAN_SHEET_POINTS_BY_POSITION[player.position];
  return perEstimatedGame(player.cleanSheets * pointsPerCleanSheet, player.estimatedGames);
}

/** Total bonus points per game. Null if the player hasn't played, or has no data for the selected mode. */
export function bonusPerGame(player: NormalizedPlayer): number | null {
  return perEstimatedGame(player.bonus, player.estimatedGames);
}

/**
 * Clean-sheet points/game + total bonus/game — the closest honest read
 * of "defensive reward rate" available from the public API. This is
 * deliberately NOT "bonus points caused by defensive contribution":
 * defensive actions feed into the Bonus Points System alongside goals,
 * assists, clean sheets, and saves, but the API only exposes total bonus,
 * never a breakdown by contributing factor. Using total bonus here is a
 * proxy, not an isolation — labelled as such wherever this is shown.
 */
export function defensiveRewardPerGame(player: NormalizedPlayer): number | null {
  const cs = cleanSheetPointsPerGame(player);
  const bonus = bonusPerGame(player);
  if (cs === null || bonus === null) return null;
  return cs + bonus;
}
