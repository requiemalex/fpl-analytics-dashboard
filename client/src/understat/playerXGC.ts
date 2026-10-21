import type { UsPlayerTotals } from "./schema";
import type { UsShot } from "./profileData";

/**
 * <understat_player_xgc>: Understat's version of a player's xGC (expected
 * goals conceded) — the one rule for it everywhere (owner's decision,
 * 2026-10-21). Understat publishes no expected goals conceded per player,
 * so it's the xG of the shots his club's opponents took while he was on
 * the pitch (server/src/understat/onPitch.ts <shots_faced_on_pitch>), the
 * same shots as his profile's Shots Faced map — what FPL's xGC measures,
 * from Understat's shots. It sums each shot's xG (a shot and its rebound
 * count twice, unlike a club's per-chance xGA, <club_xg_is_per_chance>).
 *
 * Unknown ("—", never 0) for a season summary written before the sync
 * added shots faced, or where one of those opponents' shot lists is short
 * (<incomplete_shot_list>).
 */
export function understatPlayerXGC(t: UsPlayerTotals): number | null {
  if (!t.facing || !t.facing.complete) return null;
  return Object.values(t.facing.situations).reduce((sum, s) => sum + s.xG, 0);
}

/** The same figure for each match, from his profile's shots faced: fixture -> xG faced while he was on. */
export function xGCByFixture(shotsFaced: UsShot[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of shotsFaced) out.set(s.fixture, (out.get(s.fixture) ?? 0) + s.xG);
  return out;
}
