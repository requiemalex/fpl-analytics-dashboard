import type { NormalizedPlayer } from "../types/normalized";
import type { HistoricPlayerProfile } from "./historicAnalysis";
import { perGame, estimatedPointsPerGame } from "./calculations";

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
 * <retained_not_omitted>: every player is always returned — never
 * dropped from a list, never excluded from a page's row count. When
 * there's nothing to show for the selected mode (no "last completed
 * season" entry, or zero qualifying seasons), every performance field
 * (totalPoints, minutes, goals, assists, cleanSheets, bonus, bps, and
 * everything already-nullable like xG/starts/ictIndex) comes back
 * `null` — identity (name, team, position), price, and ownership stay
 * live either way. `hasDataForMode(resolved)` is the canonical way to
 * check whether a resolved player actually has something to show;
 * every display already renders a null field as "—" via
 * utils/format.ts, so most callers don't need to check at all. This
 * replaced an earlier design that returned `null` for the whole player
 * and had callers filter those out of their lists — changed directly at
 * the user's request: they wanted every view to keep showing the full
 * player count, with per-field "—" for whichever players don't qualify,
 * rather than shrinking lists silently.
 *
 * <price_always_live>: price is always today's real live price, in every
 * mode, including every metric derived from it (Points/£m and friends) —
 * changed directly at the user's request, to match how ownership already
 * behaves and stay consistent across every view: what a player costs
 * right now is the number that matters for squad-building, even when
 * looking at a past season's output. This replaced an earlier design
 * that used that season's end-of-season price instead, on the reasoning
 * that comparing historic points against today's price is a mismatched
 * ratio — a real tradeoff, just not the one wanted here. The Career
 * History season-by-season table is a deliberate, separate exception:
 * it's specifically showing what a player cost *at the time*, for each
 * season, so it keeps reading historic price directly from
 * HistoricPlayerProfile rather than through this function.
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
 * needing them to be nullable. Per-game rates go to null instead of
 * zero, since a rate is undefined (not zero) with zero minutes played —
 * `perGame(0, 0)` already returns null, so this falls out for free.
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
/** A resolved player with nothing to show for the selected mode has every performance field nulled — this is the one canonical check for that, rather than each caller picking a different field to test. */
export function hasDataForMode(resolved: NormalizedPlayer): boolean {
  return resolved.totalPoints !== null;
}

/** Every performance field set to null — identity, price, and ownership are the caller's job to keep live, same as every other branch. */
function nullPerformanceFields(player: NormalizedPlayer): NormalizedPlayer {
  return {
    ...player,
    totalPoints: null,
    pointsPerGame: null,
    minutes: null,
    starts: null,
    goals: null,
    assists: null,
    cleanSheets: null,
    bonus: null,
    bps: null,
    ictIndex: null,
    xG: null,
    xA: null,
    xGI: null,
    xGC: null,
    xGPerGame: null,
    xAPerGame: null,
    xGIPerGame: null,
    xGCPerGame: null,
    defensiveContributions: null,
    defensiveContributionsPerGame: null,
  };
}

export function resolvePlayerStats(
  player: NormalizedPlayer,
  mode: AnalysisMode,
  historicProfile: HistoricPlayerProfile | undefined,
  currentSeasonHasStarted: boolean,
): NormalizedPlayer {
  if (mode === "live") {
    if (currentSeasonHasStarted) {
      // The live player's own totals + minutes, run through this app's
      // own perGame() — never FPL's raw per-90 fields, which normalize/
      // normalizePlayers.ts deliberately leaves null (see
      // <per_game_not_per_90>, calculations.ts). Every analysis mode
      // resolves these the same way, live included.
      return {
        ...player,
        xGPerGame: perGame(player.xG, player.minutes),
        xAPerGame: perGame(player.xA, player.minutes),
        xGIPerGame: perGame(player.xGI, player.minutes),
        xGCPerGame: perGame(player.xGC, player.minutes),
        defensiveContributionsPerGame: perGame(player.defensiveContributions, player.minutes),
        savesPerGame: perGame(player.saves, player.minutes),
      };
    }
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
      xGPerGame: null,
      xAPerGame: null,
      xGIPerGame: null,
      xGCPerGame: null,
      defensiveContributions: 0,
      defensiveContributionsPerGame: null,
      savesPerGame: null,
    };
  }

  if (mode === "lastSeason") {
    const s = historicProfile?.lastCompletedSeason;
    if (!s) return nullPerformanceFields(player);
    return {
      ...player,
      totalPoints: s.totalPoints,
      pointsPerGame: estimatedPointsPerGame(s.totalPoints, s.minutes),
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
      xGPerGame: perGame(s.xG, s.minutes),
      xAPerGame: perGame(s.xA, s.minutes),
      xGIPerGame: perGame(s.xGI, s.minutes),
      xGCPerGame: perGame(s.xGC, s.minutes),
      defensiveContributions: s.defensiveContribution,
      defensiveContributionsPerGame: perGame(s.defensiveContribution, s.minutes),
    };
  }

  // historicAverage
  const avg = historicProfile?.qualifyingAverage;
  if (!avg) return nullPerformanceFields(player);
  return {
    ...player,
    totalPoints: avg.avgPointsPerSeason ?? 0,
    pointsPerGame: estimatedPointsPerGame(avg.avgPointsPerSeason, avg.avgMinutesPerSeason),
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
    xGPerGame: perGame(avg.avgXGPerSeason, avg.avgMinutesPerSeason),
    xAPerGame: perGame(avg.avgXAPerSeason, avg.avgMinutesPerSeason),
    xGIPerGame: perGame(avg.avgXGIPerSeason, avg.avgMinutesPerSeason),
    xGCPerGame: perGame(avg.avgXGCPerSeason, avg.avgMinutesPerSeason),
    defensiveContributions: avg.avgDefensiveContributionPerSeason,
    defensiveContributionsPerGame: perGame(avg.avgDefensiveContributionPerSeason, avg.avgMinutesPerSeason),
  };
}

/**
 * Resolves a whole player list at once. Every player is always included —
 * nobody is dropped for lacking data in the selected mode, per
 * <retained_not_omitted> above. `noDataCount` is still returned (renamed
 * from the old `omittedCount`, since nothing is actually omitted any
 * more) purely so a page can still caption "N players have no data in
 * this view" if it wants to — it no longer affects which rows appear.
 */
export function resolvePlayerStatsList(
  players: NormalizedPlayer[],
  mode: AnalysisMode,
  historicProfiles: Map<number, HistoricPlayerProfile>,
  currentSeasonHasStarted: boolean,
): { resolved: NormalizedPlayer[]; noDataCount: number } {
  const resolved: NormalizedPlayer[] = [];
  let noDataCount = 0;
  for (const p of players) {
    const r = resolvePlayerStats(p, mode, historicProfiles.get(p.id), currentSeasonHasStarted);
    if (!hasDataForMode(r)) noDataCount += 1;
    resolved.push(r);
  }
  return { resolved, noDataCount };
}
