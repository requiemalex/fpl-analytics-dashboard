import type { NormalizedPlayer } from "../types/normalized";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { per90 } from "./calculations";

export type AnalysisMode = "live" | "lastSeason" | "historicAverage";

export const ANALYSIS_MODE_LABELS: Record<AnalysisMode, string> = {
  live: "Live Season",
  lastSeason: "Last Completed Season",
  historicAverage: "Historic Average",
};

/**
 * Given the active analysis mode, returns a NormalizedPlayer-shaped
 * object with performance fields swapped to the selected historic view
 * (or the live object, for "live" mode) — every existing page, chart,
 * and metric function that already operates on NormalizedPlayer works
 * on the result without modification.
 *
 * Returns null when there's nothing to show for the selected mode (no
 * "last completed season" entry, or zero qualifying seasons) — callers
 * filter these out rather than display a misleadingly all-zero player.
 *
 * <historic_price_choice>: price becomes that season's (or the
 * qualifying average's) end-of-season price rather than today's live
 * price — comparing a past season's points against today's price would
 * be a mismatched, misleading ratio for anything like Points/£m. Falls
 * back to the live price only in the unexpected case where the historic
 * price itself is missing.
 *
 * <live_mode_preseason_fix>: "live" mode is NOT simply "return the
 * player unchanged". Confirmed directly against the raw API: FPL does
 * not reset bootstrap-static's cumulative fields (points, minutes,
 * goals, assists, xG-family, ICT, bonus, bps, DC, starts) at the season
 * boundary — they carry the previous season's final totals until the new
 * season has actually started accumulating real data. Before that, the
 * TRUE current-season value for every one of those fields is genuinely
 * zero (zero games played, zero points scored) — not "unknown", an
 * actual, correct zero — so it's safe to zero them here rather than
 * needing them to be nullable. Per-90 rates go to null instead of zero,
 * since a rate is undefined (not zero) with zero minutes played —
 * `per90(0, 0)` already returns null, so this falls out for free.
 * `currentSeasonHasStarted` (any club with `played > 0`) is the signal
 * for whether to trust the raw fields or apply this correction. Price,
 * ownership, status, news, and chance-of-playing are untouched either
 * way — those are genuinely live regardless of whether the season has
 * started accumulating stats.
 *
 * Identity fields (id, name, team, position, status, news) always come
 * from the live player. Ownership ALSO always reflects today's live
 * figure in every mode — the FPL API has no historic per-season
 * ownership at all (confirmed directly against the raw data), so rather
 * than show a confusing blank, this shows current ownership as a
 * deliberate, labelled choice: "who's popular right now", not "who was
 * popular in that season". Defensive Contributions IS resolved
 * historically — it's tracked in history_past from the 2024/25 season
 * on; seasons before that contribute null, not a diluting zero, to a
 * historic average (see historicAnalysis.ts / README).
 */
export function resolvePlayerStats(
  player: NormalizedPlayer,
  mode: AnalysisMode,
  historicProfile: HistoricPlayerProfile | undefined,
  currentSeasonHasStarted: boolean,
): NormalizedPlayer | null {
  if (mode === "live") {
    if (currentSeasonHasStarted) return player;
    return {
      ...player,
      totalPoints: 0,
      pointsPerGame: null,
      minutes: 0,
      starts: 0,
      goals: 0,
      assists: 0,
      cleanSheets: 0,
      bonus: 0,
      bps: 0,
      ictIndex: 0,
      xG: 0,
      xA: 0,
      xGI: 0,
      xGC: 0,
      xGPer90: null,
      xAPer90: null,
      xGIPer90: null,
      xGCPer90: null,
      defensiveContributions: 0,
      defensiveContributionsPer90: null,
    };
  }

  if (mode === "lastSeason") {
    const s = historicProfile?.lastCompletedSeason;
    if (!s) return null;
    return {
      ...player,
      price: s.endCost ?? s.startCost ?? player.price,
      totalPoints: s.totalPoints,
      pointsPerGame: per90(s.totalPoints, s.minutes),
      minutes: s.minutes,
      starts: s.starts,
      goals: s.goals,
      assists: s.assists,
      cleanSheets: s.cleanSheets,
      bonus: s.bonus,
      bps: s.bps,
      ictIndex: s.ictIndex,
      xG: s.xG,
      xA: s.xA,
      xGI: s.xGI,
      xGC: s.xGC,
      xGPer90: per90(s.xG, s.minutes),
      xAPer90: per90(s.xA, s.minutes),
      xGIPer90: per90(s.xGI, s.minutes),
      xGCPer90: per90(s.xGC, s.minutes),
      defensiveContributions: s.defensiveContribution,
      defensiveContributionsPer90: per90(s.defensiveContribution, s.minutes),
    };
  }

  // historicAverage
  const avg = historicProfile?.qualifyingAverage;
  if (!avg) return null;
  return {
    ...player,
    price: avg.avgPrice ?? player.price,
    totalPoints: avg.avgPointsPerSeason ?? 0,
    pointsPerGame: per90(avg.avgPointsPerSeason, avg.avgMinutesPerSeason),
    minutes: avg.avgMinutesPerSeason ?? 0,
    starts: avg.avgStartsPerSeason,
    goals: avg.avgGoalsPerSeason ?? 0,
    assists: avg.avgAssistsPerSeason ?? 0,
    cleanSheets: avg.avgCleanSheetsPerSeason ?? 0,
    bonus: avg.avgBonusPerSeason ?? 0,
    bps: avg.avgBpsPerSeason ?? 0,
    ictIndex: avg.avgIctIndex,
    xG: avg.avgXGPerSeason,
    xA: avg.avgXAPerSeason,
    xGI: avg.avgXGIPerSeason,
    xGC: avg.avgXGCPerSeason,
    xGPer90: per90(avg.avgXGPerSeason, avg.avgMinutesPerSeason),
    xAPer90: per90(avg.avgXAPerSeason, avg.avgMinutesPerSeason),
    xGIPer90: per90(avg.avgXGIPerSeason, avg.avgMinutesPerSeason),
    xGCPer90: per90(avg.avgXGCPerSeason, avg.avgMinutesPerSeason),
    defensiveContributions: avg.avgDefensiveContributionPerSeason,
    defensiveContributionsPer90: per90(avg.avgDefensiveContributionPerSeason, avg.avgMinutesPerSeason),
  };
}

/**
 * Resolves a whole player list at once, dropping anyone with nothing to
 * show for the selected mode rather than rendering all-zero rows. Returns
 * the count dropped too, so a page can show "N players have no data in
 * this view" instead of silently shrinking a list.
 */
export function resolvePlayerStatsList(
  players: NormalizedPlayer[],
  mode: AnalysisMode,
  historicProfiles: Map<number, HistoricPlayerProfile>,
  currentSeasonHasStarted: boolean,
): { resolved: NormalizedPlayer[]; omittedCount: number } {
  const resolved: NormalizedPlayer[] = [];
  let omittedCount = 0;
  for (const p of players) {
    const r = resolvePlayerStats(p, mode, historicProfiles.get(p.id), currentSeasonHasStarted);
    if (r === null) {
      omittedCount += 1;
    } else {
      resolved.push(r);
    }
  }
  return { resolved, omittedCount };
}
