/**
 * <match_record_check>: a past season's match-by-match record (the vaastav
 * archive behind /api/player-seasons) against FPL's own season totals
 * (history_past). FPL keeps no per-match record of past seasons, so where
 * the archive is short nothing approved can fill the gap; the profile says
 * so instead of passing the shortfall off as the season. One known case:
 * Evan Ferguson's 2024/25 archive gives 0 minutes for Brighton's GW24, the
 * week before his move to West Ham, so the record adds up to 368 minutes
 * and 27 points against FPL's 385 and 28 (checked 2026-10-24; every other
 * current player's 2022/23–2025/26 record matches).
 */
export interface MatchRecordShortfall {
  recordMinutes: number;
  recordPoints: number;
  fplMinutes: number;
  fplPoints: number;
}

export function matchRecordShortfall(
  rows: { minutes: number; totalPoints: number | null }[],
  season: { minutes: number; totalPoints: number },
): MatchRecordShortfall | null {
  if (rows.length === 0) return null;
  const recordMinutes = rows.reduce((sum, r) => sum + r.minutes, 0);
  const recordPoints = rows.reduce((sum, r) => sum + (r.totalPoints ?? 0), 0);
  if (recordMinutes === season.minutes && recordPoints === season.totalPoints) return null;
  return { recordMinutes, recordPoints, fplMinutes: season.minutes, fplPoints: season.totalPoints };
}
