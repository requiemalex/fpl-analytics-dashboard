import type { NormalizedPlayer, NormalizedTeam, PlayerSeasonHistory } from "../types/normalized";
import type { HistoricPlayerProfile } from "./historicAnalysis";

/** A full top-flight season's worth of possible minutes — every historic season a player has data for was a full 38-game PL season. */
const FULL_SEASON_MINUTES = 38 * 90;

/** Games played before the blend trusts live-season data as much as it's going to (fully live-weighted from this point on). */
const GAMES_FOR_FULL_CURRENT_WEIGHT = 8;

/** Even at maximum inconsistency, this share of the recency-weighted mean survives — a volatile track record is still some signal, not none. */
const MIN_CONSISTENCY_RETENTION = 0.65;

/**
 * Recency-weighted, consistency-discounted average across EVERY season in
 * the window — not just the ones that clear a minutes bar.
 *
 * <reliability_bug_fix>: this used to average only `qualifyingSeasons`
 * (seasons individually ≥900 minutes — correct for a PERFORMANCE metric,
 * where a tiny sample is noise worth excluding). Applied to RELIABILITY,
 * that was backwards: a player with one strong season and several weak
 * ones had the weak seasons silently excluded before the average was even
 * computed, since only the strong one cleared the bar — producing a
 * confidently wrong "reliable starter" figure for what was actually a
 * fringe player (confirmed directly against real examples: a backup
 * goalkeeper and a squad midfielder both showing 75-90%+ reliability off
 * a single good season). For reliability specifically, a LOW-minutes
 * season is exactly the signal that matters, not something to filter out.
 *
 * Two further refinements beyond the bug fix, both requested directly:
 * - Recency weighting: the most recent season counts for the most
 *   (weight = position in the window, oldest=1, newest=n), so last
 *   season's pattern matters more than one from three years ago.
 * - Consistency discount: a genuinely nailed-on starter has a flat, high
 *   minutes share every season; someone whose minutes swing wildly
 *   season to season is a noisier bet even at the same mean. Measured as
 *   population stdev of the (unweighted) per-season shares, normalised
 *   against the maximum possible stdev for values in [0,1] (0.5, the
 *   fully-bimodal case), then applied as a discount on the weighted mean
 *   — floored at MIN_CONSISTENCY_RETENTION so a volatile record still
 *   counts for something, not zero.
 */
function historicMinutesReliability(seasonsOldestFirst: PlayerSeasonHistory[]): number | null {
  if (seasonsOldestFirst.length === 0) return null;
  const shares = seasonsOldestFirst.map((s) => Math.min(1, s.minutes / FULL_SEASON_MINUTES));
  const n = shares.length;

  const weights = shares.map((_, i) => i + 1); // oldest = 1, ..., most recent = n
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedMean = shares.reduce((sum, share, i) => sum + share * weights[i], 0) / totalWeight;

  if (n === 1) return weightedMean; // nothing to measure consistency against with a single season

  const mean = shares.reduce((a, b) => a + b, 0) / n;
  const variance = shares.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const consistency = Math.max(0, 1 - stdev / 0.5);

  return weightedMean * (MIN_CONSISTENCY_RETENTION + (1 - MIN_CONSISTENCY_RETENTION) * consistency);
}

function currentSeasonMinutesReliability(player: NormalizedPlayer, team: NormalizedTeam | undefined): number | null {
  const possible = (team?.played ?? 0) * 90;
  if (possible <= 0 || player.minutes === null) return null;
  return Math.min(1, Math.max(0, player.minutes / possible));
}

/** FPL's unavailable statuses: injured, suspended, unavailable, not available (on loan). */
const UNAVAILABLE_STATUSES = new Set(["i", "s", "u", "n"]);

/** Chance-of-playing when FPL publishes one; otherwise a status-based default (shared with Model Predicted, pointsModelLive.ts). Never invents a specific percentage for a real doubt FPL hasn't quantified. Null when neither is known (audit 2026-10-18 L4: a missing status isn't "available"). */
export function availabilityModifier(player: NormalizedPlayer): number | null {
  if (player.chanceOfPlayingNextRound !== null) return player.chanceOfPlayingNextRound / 100;
  if (player.status === "a") return 1;
  if (player.status === "d") return 0.5;
  if (UNAVAILABLE_STATUSES.has(player.status)) return 0;
  return null;
}

export interface BlendedReliability {
  value: number | null;
  /** 0–1, how much the blend currently trusts live-season data over history — shown so the figure isn't a black box about to shift under you as the season progresses. */
  currentWeight: number;
}

/**
 * Blends current-season and historic minutes reliability, shifting trust
 * toward live data as real gameweeks accumulate (pre-season this is
 * entirely historic; by game 8 of the live season it's entirely
 * current), then multiplies by availability last — so an injured player
 * with a perfect track record still shows near-zero reliability right now.
 * Only minutes evidence goes in: ownership is a popularity figure, not a
 * minutes input, so it plays no part (owner's decision, audit 2026-10-18
 * M12), and with no minutes data anywhere the value is null. Deliberately independent
 * of any analysis-mode toggle: this is a single predictive figure, not
 * something that should read differently depending on which historic
 * view happens to be selected elsewhere on the page.
 */
export function computeBlendedMinutesReliability(
  player: NormalizedPlayer,
  team: NormalizedTeam | undefined,
  historicProfile: HistoricPlayerProfile | undefined,
): BlendedReliability {
  const current = currentSeasonMinutesReliability(player, team);
  const historic = historicMinutesReliability(historicProfile?.allSeasonsInWindow ?? []);
  const gamesPlayed = team?.played ?? 0;
  const currentWeight = Math.min(1, gamesPlayed / GAMES_FOR_FULL_CURRENT_WEIGHT);

  let playingTimeBase: number | null;
  if (current === null && historic === null) playingTimeBase = null;
  else if (current === null) playingTimeBase = historic;
  else if (historic === null) playingTimeBase = current;
  else playingTimeBase = currentWeight * current + (1 - currentWeight) * historic;

  const availability = availabilityModifier(player);
  if (playingTimeBase === null || availability === null) return { value: null, currentWeight };
  return { value: playingTimeBase * availability, currentWeight };
}
